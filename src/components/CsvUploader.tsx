import { useState, useRef, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Trash2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PhoneRate {
  country: string;
  network: string;
  prefix: string;
  rate: number;
  rate_type?: string;
}

interface ParseError {
  row: number;
  message: string;
}

type UploadStatus = "idle" | "parsing" | "confirming" | "uploading" | "success" | "error";

function parseCSV(text: string): { data: PhoneRate[]; errors: ParseError[] } {
  const lines = text.trim().split(/\r?\n/);
  const errors: ParseError[] = [];
  const data: PhoneRate[] = [];

  if (lines.length < 2) {
    errors.push({ row: 0, message: "The CSV file is empty or has no data rows." });
    return { data, errors };
  }

  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const colMap = buildColMap(header);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));

    const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
    const network = colMap["phone company"] >= 0 ? cols[colMap["phone company"]] : cols[1];
    const prefix = colMap["prefix"] >= 0 ? cols[colMap["prefix"]] : cols[2];
    const rateRaw = colMap["price"] >= 0 ? cols[colMap["price"]] : cols[3];

    if (!country || !network || !prefix || !rateRaw) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: incomplete data.` });
      continue;
    }

    const rate = parseFloat(rateRaw);
    if (isNaN(rate)) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: invalid rate "${rateRaw}".` });
      continue;
    }

    data.push({ country, network, prefix, rate, rate_type: "International" });
  }

  return { data, errors };
}

const COL_PAIRS: [string, string[]][] = [
  ["country", ["country"]],
  ["phone company", ["phone company", "network"]],
  ["prefix", ["prefix"]],
  ["price", ["price", "rate"]],
];

function buildColMap(header: string[]): Record<string, number> {
  const lower = header.map((h) => String(h).toLowerCase().trim().replace(/"/g, ""));
  const colMap: Record<string, number> = {};
  for (const [canonical, aliases] of COL_PAIRS) {
    for (const alias of aliases) {
      const idx = lower.findIndex(
        (h) =>
          h === alias ||
          h === alias.replace(" ", "_") ||
          h === alias.replace(" ", "")
      );
      if (idx >= 0) {
        colMap[canonical] = idx;
        break;
      }
    }
  }
  return colMap;
}

const XLSX_SHEET_NAMES = ["International", "Origin Based", "Local"] as const;
const DATA_START_ROW = 12; // 0-indexed: row 13 in Excel has headers

function parseSheetRows(
  sheet: XLSX.WorkSheet,
  sheetType: string,
  errors: ParseError[]
): PhoneRate[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
  const data: PhoneRate[] = [];
  if (rows.length <= DATA_START_ROW) return data;
  const headerRow = rows[DATA_START_ROW];
  if (!headerRow?.length) return data;
  const header = headerRow.map((c) => String(c ?? ""));
  const colMap = buildColMap(header);
  for (let i = DATA_START_ROW + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c).trim())) continue;
    const cols = row.map((c) => String(c ?? "").trim());
    const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
    const network = colMap["phone company"] >= 0 ? cols[colMap["phone company"]] : cols[1];
    const prefix = colMap["prefix"] >= 0 ? cols[colMap["prefix"]] : cols[2];
    const rateRaw = colMap["price"] >= 0 ? cols[colMap["price"]] : cols[3];
    if (!country || !network || !prefix || rateRaw === undefined || rateRaw === "") continue;
    const rate = parseFloat(rateRaw);
    if (isNaN(rate)) {
      errors.push({ row: i + 1, message: `Sheet "${sheetType}" row ${i + 1}: invalid rate "${rateRaw}".` });
      continue;
    }
    data.push({ country, network, prefix, rate, rate_type: sheetType });
  }
  return data;
}

function parseXLSX(buffer: ArrayBuffer): { data: PhoneRate[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const data: PhoneRate[] = [];
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetNames = wb.SheetNames;
    if (!sheetNames?.length) {
      errors.push({ row: 0, message: "The file has no sheets." });
      return { data, errors };
    }
    const sheetsToRead = XLSX_SHEET_NAMES.filter((name) =>
      sheetNames.some((s) => s.trim() === name)
    );
    if (sheetsToRead.length > 0) {
      for (const sheetType of sheetsToRead) {
        const sheetName = sheetNames.find((s) => s.trim() === sheetType)!;
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const sheetData = parseSheetRows(sheet, sheetType, errors);
        data.push(...sheetData);
      }
    } else {
      const firstSheet = sheetNames[0];
      const sheet = wb.Sheets[firstSheet];
      const sheetData = parseSheetRows(sheet, "International", errors);
      data.push(...sheetData);
    }
  } catch (e) {
    errors.push({ row: 0, message: e instanceof Error ? e.message : "Error reading XLSX." });
  }
  return { data, errors };
}

interface Vendor {
  id: string;
  nombre: string;
  estado: string;
}

export default function CsvUploader() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<PhoneRate[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadVendors = async () => {
      try {
        const { data, error } = await supabase
          .from("vendors")
          .select("id, nombre, estado")
          .order("nombre");
        if (!cancelled && !error && data) setVendors(data);
      } catch {
        // If it fails (e.g. table missing), leave vendors empty; dropdown will show "Unassigned"
      }
    };
    loadVendors();
    return () => { cancelled = true; };
  }, []);

  const resetState = () => {
    setStatus("idle");
    setFileName(null);
    setParsedData([]);
    setParseErrors([]);
    setUploadedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const doUpload = async (data: PhoneRate[], name: string) => {
    setStatus("uploading");

    if (selectedVendorId) {
      const { data: existing } = await supabase
        .from("csv_uploads")
        .select("id")
        .eq("vendor_id", selectedVendorId);
      if (existing?.length) {
        for (const row of existing) {
          await supabase.from("csv_uploads").delete().eq("id", row.id);
        }
      }
    }

    const { data: uploadRow, error: uploadError } = await supabase
      .from("csv_uploads")
      .insert({
        file_name: name,
        vendor_id: selectedVendorId || null,
      })
      .select("id")
      .single();

    if (uploadError || !uploadRow?.id) {
      setParseErrors((prev) => [
        ...prev,
        { row: -1, message: `Save error: ${uploadError?.message ?? "Could not create upload"}` },
      ]);
      setStatus("error");
      return;
    }

    const uploadId = uploadRow.id;
    const BATCH = 100;
    let total = 0;

    for (let i = 0; i < data.length; i += BATCH) {
      const batch = data.slice(i, i + BATCH).map((row) => ({
        country: row.country,
        network: row.network,
        prefix: row.prefix,
        rate: row.rate,
        rate_type: row.rate_type ?? "International",
        upload_id: uploadId,
      }));
      const { error } = await supabase.from("phone_rates").insert(batch);
      if (error) {
        setParseErrors((prev) => [
          ...prev,
          { row: -1, message: `Save error: ${error.message}` },
        ]);
        setStatus("error");
        return;
      }
      total += batch.length;
      setUploadedCount(total);
    }

    setStatus("success");
  };

  const handleFile = async (file: File) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      setParseErrors([{ row: 0, message: "Only .csv or .xlsx files are accepted." }]);
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("parsing");

    let data: PhoneRate[];
    let errors: ParseError[];
    if (isCsv) {
      const text = await file.text();
      const result = parseCSV(text);
      data = result.data;
      errors = result.errors;
    } else {
      const buffer = await file.arrayBuffer();
      const result = parseXLSX(buffer);
      data = result.data;
      errors = result.errors;
    }

    setParseErrors(errors);
    setParsedData(data);

    if (data.length === 0) {
      setStatus("error");
      return;
    }

    setStatus("confirming");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <>
      {/* Confirmation Dialog */}
      <AlertDialog open={status === "confirming"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm upload</AlertDialogTitle>
            <AlertDialogDescription>
            You are about to import <strong>{parsedData.length} records</strong> from{" "}
            <span className="font-mono">{fileName}</span> for the selected vendor.
            {selectedVendorId
              ? " Any existing CSV/XLSX for this vendor will be replaced."
              : " They will appear in the comparison view."}{" "}
            Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetState}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doUpload(parsedData, fileName ?? "import.csv")}>
              Yes, import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-2xl mx-auto space-y-6">
        {/* Vendor selector */}
        <div className="space-y-2">
          <Label htmlFor="vendor-select">Vendor for this file</Label>
          <Select
            value={selectedVendorId ?? "__none__"}
            onValueChange={(value) => setSelectedVendorId(value === "__none__" ? null : value)}
          >
            <SelectTrigger id="vendor-select" className="w-full max-w-xs">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.nombre}
                  {v.estado === "desactivado" && (
                    <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The selected vendor will be assigned to the CSV or XLSX file you upload.
          </p>
        </div>

        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
            ${isDragging ? "border-primary bg-accent scale-[1.01]" : "border-border bg-card hover:border-primary hover:bg-accent/40"}
            ${status === "success" ? "border-success bg-success-muted" : ""}
          `}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={onFileChange}
          />

          <div className="flex flex-col items-center gap-4 py-12 px-8 text-center">
            {status === "idle" && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Drag a CSV or XLSX file here
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to select
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center text-xs text-muted-foreground">
                  {["country", "network", "prefix", "rate"].map((col) => (
                    <span key={col} className="bg-muted px-2 py-1 rounded-full font-mono">
                      {col}
                    </span>
                  ))}
                </div>
              </>
            )}

            {status === "parsing" && (
              <>
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-base font-medium text-foreground">Parsing file…</p>
              </>
            )}

            {status === "confirming" && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <p className="text-base font-medium text-foreground">
                  {parsedData.length} records ready — confirm in the dialog
                </p>
              </>
            )}

            {status === "uploading" && (
              <>
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-base font-medium text-foreground">
                  Saving records… ({uploadedCount} / {parsedData.length})
                </p>
                <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${parsedData.length ? (uploadedCount / parsedData.length) * 100 : 0}%` }}
                  />
                </div>
              </>
            )}

            {status === "success" && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-success-muted flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-success">
                    {uploadedCount} records saved!
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
                </div>
              </>
            )}

            {status === "error" && parseErrors.length > 0 && parsedData.length === 0 && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <p className="text-base font-medium text-destructive">
                  Could not process the file
                </p>
              </>
            )}
          </div>

          {/* File name badge */}
          {fileName && status !== "idle" && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
              <FileText className="w-3 h-3" />
              {fileName}
              <button
                onClick={(e) => { e.stopPropagation(); resetState(); }}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Errors */}
        {parseErrors.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {parseErrors.length} warning{parseErrors.length > 1 ? "s" : ""}
            </p>
            <ul className="space-y-1">
              {parseErrors.slice(0, 5).map((err, i) => (
                <li key={i} className="text-xs text-destructive/80 font-mono pl-2 border-l-2 border-destructive/30">
                  {err.message}
                </li>
              ))}
              {parseErrors.length > 5 && (
                <li className="text-xs text-muted-foreground pl-2">
                  …and {parseErrors.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Preview table */}
        {parsedData.length > 0 && status !== "idle" && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Preview — {parsedData.length} rows
              </p>
              {status === "success" && (
                <button
                  onClick={resetState}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Upload another file
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border bg-card">
                    {["Country", "Network", "Prefix", "Rate"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5 text-foreground">{row.country}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.network}</td>
                      <td className="px-4 py-2.5 font-mono text-primary">{row.prefix}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.rate.toFixed(4)}</td>
                    </tr>
                  ))}
                  {parsedData.length > 50 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-center text-xs text-muted-foreground">
                        …showing 50 of {parsedData.length} rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
