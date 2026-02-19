import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Trash2, X } from "lucide-react";
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

interface PhoneRate {
  country: string;
  phone_company: string;
  prefix: string;
  price: number;
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

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const expectedCols = ["country", "phone company", "prefix", "price"];

  const colMap: Record<string, number> = {};
  for (const expected of expectedCols) {
    const idx = header.findIndex(
      (h) =>
        h === expected ||
        h === expected.replace(" ", "_") ||
        h === expected.replace(" ", "")
    );
    colMap[expected] = idx;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));

    const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
    const phone_company = colMap["phone company"] >= 0 ? cols[colMap["phone company"]] : cols[1];
    const prefix = colMap["prefix"] >= 0 ? cols[colMap["prefix"]] : cols[2];
    const priceRaw = colMap["price"] >= 0 ? cols[colMap["price"]] : cols[3];

    if (!country || !phone_company || !prefix || !priceRaw) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: incomplete data.` });
      continue;
    }

    const price = parseFloat(priceRaw);
    if (isNaN(price)) {
      errors.push({ row: i + 1, message: `Row ${i + 1}: invalid price "${priceRaw}".` });
      continue;
    }

    data.push({ country, phone_company, prefix, price });
  }

  return { data, errors };
}

export default function CsvUploader() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<PhoneRate[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStatus("idle");
    setFileName(null);
    setParsedData([]);
    setParseErrors([]);
    setUploadedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const doUpload = async (data: PhoneRate[]) => {
    setStatus("uploading");
    const BATCH = 100;
    let total = 0;

    for (let i = 0; i < data.length; i += BATCH) {
      const batch = data.slice(i, i + BATCH);
      const { error } = await supabase.from("phone_rates").upsert(batch, {
        onConflict: "country,phone_company,prefix",
        ignoreDuplicates: false,
      });
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
    if (!file.name.endsWith(".csv")) {
      setParseErrors([{ row: 0, message: "Only .csv files are accepted." }]);
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("parsing");

    const text = await file.text();
    const { data, errors } = parseCSV(text);

    setParseErrors(errors);
    setParsedData(data);

    if (data.length === 0) {
      setStatus("error");
      return;
    }

    // Show confirmation dialog
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
              <span className="font-mono">{fileName}</span>. Existing records with the same
              country, company and prefix will be updated. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetState}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doUpload(parsedData)}>
              Yes, import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-2xl mx-auto space-y-6">
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
            accept=".csv"
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
                    Drag your CSV file here
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to select it
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center text-xs text-muted-foreground">
                  {["country", "phone company", "prefix", "price"].map((col) => (
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
                  Upload another
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    {["Country", "Company", "Prefix", "Price"].map((h) => (
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
                      <td className="px-4 py-2.5 text-foreground">{row.phone_company}</td>
                      <td className="px-4 py-2.5 font-mono text-primary">{row.prefix}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.price.toFixed(4)}</td>
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
