import { useState, useRef } from "react";
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

interface CountryRegionRow {
  country: string;
  region: string;
  region_code: string;
  effective_date: string | null;
  valid_to: string | null;
  date_added: string | null;
}

interface ParseError {
  row: number;
  message: string;
}

type UploadStatus = "idle" | "parsing" | "confirming" | "uploading" | "success" | "error";

const COL_ALIASES: [string, string[]][] = [
  ["country", ["country"]],
  ["region", ["region"]],
  ["region_code", ["regioncode", "region_code"]],
  ["effective_date", ["effectivedate", "effective_date", "effectiveda"]],
  ["valid_to", ["validto", "valid_to"]],
  ["date_added", ["dateadded", "date_added"]],
];

function buildColMap(header: string[]): Record<string, number> {
  const lower = header.map((h) => String(h).toLowerCase().trim().replace(/"/g, ""));
  const colMap: Record<string, number> = {};
  for (const [canonical, aliases] of COL_ALIASES) {
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

function parseDate(val: string | undefined): string | null {
  if (!val?.trim()) return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseCSV(text: string): { data: CountryRegionRow[]; errors: ParseError[] } {
  const lines = text.trim().split(/\r?\n/);
  const errors: ParseError[] = [];
  const data: CountryRegionRow[] = [];

  if (lines.length < 2) {
    errors.push({ row: 0, message: "El archivo está vacío o no tiene filas de datos." });
    return { data, errors };
  }

  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const colMap = buildColMap(header);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));

    const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
    const region = colMap["region"] >= 0 ? cols[colMap["region"]] : cols[1];
    const regionCode = colMap["region_code"] >= 0 ? cols[colMap["region_code"]] : cols[2];

    if (!country?.trim() || !region?.trim() || !regionCode?.trim()) {
      errors.push({ row: i + 1, message: `Fila ${i + 1}: faltan Country, Region o RegionCode.` });
      continue;
    }

    data.push({
      country: country.trim(),
      region: region.trim(),
      region_code: String(regionCode).trim(),
      effective_date: parseDate(colMap["effective_date"] >= 0 ? cols[colMap["effective_date"]] : undefined),
      valid_to: parseDate(colMap["valid_to"] >= 0 ? cols[colMap["valid_to"]] : undefined),
      date_added: parseDate(colMap["date_added"] >= 0 ? cols[colMap["date_added"]] : undefined),
    });
  }

  return { data, errors };
}

function parseXLSX(buffer: ArrayBuffer): { data: CountryRegionRow[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const data: CountryRegionRow[] = [];

  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      errors.push({ row: 0, message: "El archivo no tiene hojas." });
      return { data, errors };
    }

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];

    if (rows.length < 2) {
      errors.push({ row: 0, message: "El archivo está vacío o no tiene filas de datos." });
      return { data, errors };
    }

    const header = rows[0].map((c) => String(c ?? ""));
    const colMap = buildColMap(header);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => !String(c).trim())) continue;

      const cols = row.map((c) => String(c ?? "").trim());

      const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
      const region = colMap["region"] >= 0 ? cols[colMap["region"]] : cols[1];
      const regionCode = colMap["region_code"] >= 0 ? cols[colMap["region_code"]] : cols[2];

      if (!country?.trim() || !region?.trim() || !regionCode?.trim()) continue;

      data.push({
        country: country.trim(),
        region: region.trim(),
        region_code: String(regionCode).trim(),
        effective_date: parseDate(colMap["effective_date"] >= 0 ? cols[colMap["effective_date"]] : undefined),
        valid_to: parseDate(colMap["valid_to"] >= 0 ? cols[colMap["valid_to"]] : undefined),
        date_added: parseDate(colMap["date_added"] >= 0 ? cols[colMap["date_added"]] : undefined),
      });
    }
  } catch (e) {
    errors.push({ row: 0, message: e instanceof Error ? e.message : "Error al leer el archivo." });
  }

  return { data, errors };
}

interface CountriesFileUploaderProps {
  onSuccess?: () => void;
  compact?: boolean;
}

export default function CountriesFileUploader({ onSuccess, compact = false }: CountriesFileUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<CountryRegionRow[]>([]);
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

  const BATCH_SIZE = 500;

  const doUpload = async (data: CountryRegionRow[]) => {
    setStatus("uploading");

    const countryByName = new Map<string, string>();
    const uniqueCountries = [...new Set(data.map((r) => r.country.trim()))];

    for (const nombre of uniqueCountries) {
      const countryKey = nombre.toUpperCase();
      const { data: existing } = await supabase
        .from("countries")
        .select("id")
        .ilike("nombre", nombre)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        countryByName.set(countryKey, existing.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("countries")
          .insert({ nombre })
          .select("id")
          .single();

        if (error) {
          setParseErrors((prev) => [...prev, { row: 0, message: `Error al crear país "${nombre}": ${error.message}` }]);
          setStatus("error");
          return;
        }
        countryByName.set(countryKey, inserted!.id);
      }
    }

    let total = 0;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const rows = batch.map((row) => {
        const countryId = countryByName.get(row.country.toUpperCase().trim())!;
        return {
          country_id: countryId,
          region: row.region,
          region_code: row.region_code,
          effective_date: row.effective_date || null,
          valid_to: row.valid_to || null,
          date_added: row.date_added || null,
        };
      });

      const { error } = await supabase.from("country_regions").upsert(rows, {
        onConflict: "country_id,region,region_code",
        ignoreDuplicates: false,
      });

      if (error) {
        setParseErrors((prev) => [...prev, { row: i + 2, message: `Error en lote: ${error.message}` }]);
        setStatus("error");
        return;
      }

      total += batch.length;
      setUploadedCount(total);
    }

    setStatus("success");
    onSuccess?.();
  };

  const handleFile = async (file: File) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      setParseErrors([{ row: 0, message: "Solo se aceptan archivos .csv o .xlsx." }]);
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setStatus("parsing");

    let data: CountryRegionRow[];
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
      <AlertDialog open={status === "confirming"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importación</AlertDialogTitle>
            <AlertDialogDescription>
              Se importarán <strong>{parsedData.length} registros</strong> de{" "}
              <span className="font-mono">{fileName}</span>. Se crearán países si no existen y se
              insertarán/actualizarán las regiones con sus códigos. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetState}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => doUpload(parsedData)}>Sí, importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={`w-full mx-auto space-y-4 ${compact ? "max-w-md" : "max-w-2xl"}`}>
        <div
          className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer
            ${isDragging ? "border-primary bg-accent scale-[1.01]" : "border-border bg-card hover:border-primary hover:bg-accent/40"}
            ${status === "success" ? "border-emerald-500 bg-emerald-500/10" : ""}
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

          <div className={`flex flex-col items-center gap-4 text-center ${compact ? "py-6 px-4" : "py-10 px-6"}`}>
            {status === "idle" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Subir archivo de países/regiones</p>
                  <p className="text-sm text-muted-foreground mt-1">Arrastra CSV o XLSX aquí o haz clic</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center text-xs text-muted-foreground">
                  {["Country", "Region", "RegionCode"].map((col) => (
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
                <p className="text-base font-medium text-foreground">Procesando archivo…</p>
              </>
            )}

            {status === "confirming" && (
              <>
                <FileText className="w-10 h-10 text-primary" />
                <p className="text-base font-medium text-foreground">
                  {parsedData.length} registros listos — confirma en el diálogo
                </p>
              </>
            )}

            {status === "uploading" && (
              <>
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-base font-medium text-foreground">
                  Guardando… ({uploadedCount} / {parsedData.length})
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-emerald-600">{uploadedCount} registros guardados</p>
                  <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
                </div>
              </>
            )}

            {status === "error" && parseErrors.length > 0 && parsedData.length === 0 && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <p className="text-base font-medium text-destructive">No se pudo procesar el archivo</p>
              </>
            )}
          </div>

          {fileName && status !== "idle" && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
              <FileText className="w-3 h-3" />
              {fileName}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); resetState(); }}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {parseErrors.length} advertencia(s)
            </p>
            <ul className="space-y-1">
              {parseErrors.slice(0, 5).map((err, i) => (
                <li key={i} className="text-xs text-destructive/80 font-mono pl-2 border-l-2 border-destructive/30">
                  {err.message}
                </li>
              ))}
              {parseErrors.length > 5 && (
                <li className="text-xs text-muted-foreground pl-2">…y {parseErrors.length - 5} más</li>
              )}
            </ul>
          </div>
        )}

        {parsedData.length > 0 && status !== "idle" && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Vista previa — {parsedData.length} filas</p>
              {status === "success" && (
                <button
                  type="button"
                  onClick={resetState}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Subir otro archivo
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    {["Country", "Region", "RegionCode"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">{row.country}</td>
                      <td className="px-4 py-2.5">{row.region}</td>
                      <td className="px-4 py-2.5 font-mono">{row.region_code}</td>
                    </tr>
                  ))}
                  {parsedData.length > 20 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-center text-xs text-muted-foreground">
                        …mostrando 20 de {parsedData.length}
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
