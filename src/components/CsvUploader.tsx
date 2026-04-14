import { useState, useRef, useEffect, useMemo } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Trash2, X, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn, roundUpTo3Decimals } from "@/lib/utils";
import { canonicalPrefixForMasterMatch, normalizePrefixRaw } from "@/lib/quotationPrefixCanonical";
import { compareText } from "@/lib/tableSort";

/** Canonical values for the optional CSV/XLSX `comment` column (merge mode). */
const UPLOAD_COMMENT = {
  NO_CHANGES: "No changes",
  INCREMENT: "Increment",
  DECREMENT: "Decrement",
  NEW_BRAND: "New brand",
} as const;

type UploadCommentKey = keyof typeof UPLOAD_COMMENT;

function normalizeUploadComment(raw: string | undefined | null): UploadCommentKey | "empty" | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t) return "empty";
  if (t === "no changes" || t === "no change") return "NO_CHANGES";
  if (t === "increment") return "INCREMENT";
  if (t === "decrement") return "DECREMENT";
  if (t === "new brand" || t === "newbrand") return "NEW_BRAND";
  return null;
}

interface PhoneRate {
  country: string;
  network: string;
  prefix: string;
  rate: number;
  rate_type?: string;
  /** Optional column: No changes | Increment | Decrement | New brand */
  comment?: string;
}

function commentForStorage(row: PhoneRate): string | null {
  const norm = normalizeUploadComment(row.comment);
  if (norm === null) return row.comment?.trim() || null;
  if (norm === "empty") return null;
  return UPLOAD_COMMENT[norm];
}

/** Values read from the file when a row fails validation (for error export). */
interface ParseErrorRaw {
  country: string;
  network: string;
  prefix: string;
  rate: string;
  comment: string;
}

interface ParseError {
  row: number;
  message: string;
  raw?: ParseErrorRaw;
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
    const prefixRaw = colMap["prefix"] >= 0 ? cols[colMap["prefix"]] : cols[2];
    const prefix = normalizePrefixRaw(String(prefixRaw ?? ""));
    const rateRaw = colMap["price"] >= 0 ? cols[colMap["price"]] : cols[3];

    const commentRawEarly = colMap["comment"] >= 0 ? cols[colMap["comment"]] : undefined;

    if (!country || !network || !prefix || !rateRaw) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: incomplete data.`,
        raw: {
          country: country || "",
          network: network || "",
          prefix: prefix || "",
          rate: rateRaw || "",
          comment: commentRawEarly?.trim() ?? "",
        },
      });
      continue;
    }

    const rate = parseFloat(rateRaw);
    if (isNaN(rate)) {
      errors.push({
        row: i + 1,
        message: `Row ${i + 1}: invalid rate "${rateRaw}".`,
        raw: {
          country: country || "",
          network: network || "",
          prefix: prefix || "",
          rate: String(rateRaw),
          comment: commentRawEarly?.trim() ?? "",
        },
      });
      continue;
    }

    const commentRaw = colMap["comment"] >= 0 ? cols[colMap["comment"]] : undefined;
    const comment = commentRaw?.trim() || undefined;

    data.push({
      country,
      network,
      prefix,
      rate: roundUpTo3Decimals(rate),
      rate_type: "International",
      ...(comment ? { comment } : {}),
    });
  }

  return { data, errors };
}

const COL_PAIRS: [string, string[]][] = [
  ["country", ["country"]],
  ["phone company", ["phone company", "network", "network/description", "network description", "network_description"]],
  ["prefix", ["prefix"]],
  ["price", ["price", "rate"]],
  ["comment", ["comment", "change", "change type", "status"]],
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
const LEGACY_DATA_START_ROW = 12; // 0-indexed: row 13 in Excel (legacy format)

function looksLikeHeaderRow(row: string[] | undefined): boolean {
  if (!row?.length) return false;
  const lower = row.map((c) => String(c ?? "").toLowerCase().trim());
  const hasCountry = lower.some((h) => h === "country");
  const hasRate =
    lower.some((h) => h === "rate" || h === "price") ||
    lower.some((h) => h.includes("rate") || h.includes("price"));
  const hasPrefix = lower.some((h) => h === "prefix");
  return hasCountry && hasRate && hasPrefix;
}

function detectHeaderRow(rows: string[][]): number {
  if (rows.length > 0 && looksLikeHeaderRow(rows[0])) return 0;
  if (rows.length > LEGACY_DATA_START_ROW && looksLikeHeaderRow(rows[LEGACY_DATA_START_ROW]))
    return LEGACY_DATA_START_ROW;
  return 0; // default: assume template format
}

function parseSheetRows(
  sheet: XLSX.WorkSheet,
  sheetType: string,
  errors: ParseError[]
): PhoneRate[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
  const data: PhoneRate[] = [];
  const headerRowIdx = detectHeaderRow(rows);
  if (rows.length <= headerRowIdx) return data;
  const headerRow = rows[headerRowIdx];
  if (!headerRow?.length) return data;
  const header = headerRow.map((c) => String(c ?? ""));
  const colMap = buildColMap(header);
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c).trim())) continue;
    const cols = row.map((c) => String(c ?? "").trim());
    const country = colMap["country"] >= 0 ? cols[colMap["country"]] : cols[0];
    const network = colMap["phone company"] >= 0 ? cols[colMap["phone company"]] : cols[1];
    const prefixRaw = colMap["prefix"] >= 0 ? cols[colMap["prefix"]] : cols[2];
    const prefix = normalizePrefixRaw(String(prefixRaw ?? ""));
    const rateRaw = colMap["price"] >= 0 ? cols[colMap["price"]] : cols[3];
    if (!country || !network || !prefix || rateRaw === undefined || rateRaw === "") continue;
    const rate = parseFloat(rateRaw);
    if (isNaN(rate)) {
      const commentForErr = colMap["comment"] >= 0 ? cols[colMap["comment"]] : "";
      errors.push({
        row: i + 1,
        message: `Sheet "${sheetType}" row ${i + 1}: invalid rate "${rateRaw}".`,
        raw: {
          country: country || "",
          network: network || "",
          prefix: prefix || "",
          rate: String(rateRaw),
          comment: String(commentForErr ?? "").trim(),
        },
      });
      continue;
    }
    const commentRaw = colMap["comment"] >= 0 ? cols[colMap["comment"]] : undefined;
    const comment = commentRaw?.trim() || undefined;
    data.push({
      country,
      network,
      prefix,
      rate: roundUpTo3Decimals(rate),
      rate_type: sheetType,
      ...(comment ? { comment } : {}),
    });
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

interface MissingMasterPrefixRow {
  country: string;
  network: string;
  prefix: string;
}

type UploadResultTab = "upload" | "errors" | "missing_prefixes";

interface CsvUploaderProps {
  /** When set, file is uploaded for this vendor; vendor selector is hidden */
  vendorId?: string;
  /** Display name for the missing-prefixes XLSX filename when `vendorId` is set */
  vendorName?: string;
  /** Called after successful upload (e.g. to close dialog) */
  onSuccess?: () => void;
  /** Compact UI for use inside dialogs */
  compact?: boolean;
}

function sanitizeFilenameBase(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
  return t || "vendor";
}

/** Local YYYY-MM-DD for export filenames */
function formatExportDateSlug(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildMissingMasterPrefixesFilename(vendorBase: string, dateSlug: string): string {
  return `${sanitizeFilenameBase(vendorBase)}-missing-master-prefixes-${dateSlug}.xlsx`;
}

function buildParseErrorsFilename(sourceBase: string, dateSlug: string): string {
  return `${sanitizeFilenameBase(sourceBase)}-parse-errors-${dateSlug}.xlsx`;
}

function buildInvalidCommentFilename(sourceBase: string, dateSlug: string): string {
  return `${sanitizeFilenameBase(sourceBase)}-invalid-comment-${dateSlug}.xlsx`;
}

function downloadParseErrorsXlsx(errors: ParseError[], sourceFileName: string | null) {
  const base = (sourceFileName ?? "import").replace(/\.[^.]+$/i, "");
  const dateSlug = formatExportDateSlug();
  const header = ["row", "country", "network", "prefix", "rate", "comment", "error"] as const;
  const aoa: string[][] = [
    [...header],
    ...errors.map((e) => [
      String(e.row),
      e.raw?.country ?? "",
      e.raw?.network ?? "",
      e.raw?.prefix ?? "",
      e.raw?.rate ?? "",
      e.raw?.comment ?? "",
      e.message,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Parse errors");
  XLSX.writeFile(wb, buildParseErrorsFilename(base, dateSlug));
}

function downloadInvalidCommentRowsXlsx(rows: PhoneRate[], sourceFileName: string | null) {
  if (rows.length === 0) return;
  const base = (sourceFileName ?? "import").replace(/\.[^.]+$/i, "");
  const dateSlug = formatExportDateSlug();
  const header = ["country", "network", "prefix", "rate", "rate_type", "comment", "error"] as const;
  const aoa: string[][] = [
    [...header],
    ...rows.map((r) => [
      r.country,
      r.network,
      r.prefix,
      String(r.rate),
      r.rate_type ?? "",
      r.comment ?? "",
      "Invalid comment — use: No changes, Increment, Decrement, New brand",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invalid comment");
  XLSX.writeFile(wb, buildInvalidCommentFilename(base, dateSlug));
}

export default function CsvUploader({ vendorId, vendorName: vendorNameProp, onSuccess, compact = false }: CsvUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<PhoneRate[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(vendorId ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMode, setUploadMode] = useState<"replace" | "merge">("replace");
  const [mergeSummary, setMergeSummary] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    invalid: number;
  } | null>(null);
  const [mergeInvalidRows, setMergeInvalidRows] = useState<PhoneRate[]>([]);
  const [missingMasterReport, setMissingMasterReport] = useState<{
    distinctPrefixCount: number;
    rowCount: number;
    rows: MissingMasterPrefixRow[];
    exportDateSlug: string;
  } | null>(null);
  const [resultTab, setResultTab] = useState<UploadResultTab>("upload");

  const showErrorsTab = parseErrors.length > 0;
  const showMissingPrefixesTab =
    status === "success" &&
    missingMasterReport != null &&
    missingMasterReport.distinctPrefixCount > 0;
  const showResultTabs = showErrorsTab || showMissingPrefixesTab;

  useEffect(() => {
    if (!showErrorsTab && resultTab === "errors") setResultTab("upload");
  }, [showErrorsTab, resultTab]);

  useEffect(() => {
    if (!showMissingPrefixesTab && resultTab === "missing_prefixes") setResultTab("upload");
  }, [showMissingPrefixesTab, resultTab]);

  useEffect(() => {
    if (vendorId) setSelectedVendorId(vendorId);
  }, [vendorId]);

  useEffect(() => {
    if (vendorId) return;
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
  }, [vendorId]);

  /** Avoid Radix Select error when value is not in the list (e.g. vendor was disabled). */
  const enabledVendorIds = useMemo(
    () =>
      new Set(
        vendors
          .filter((v) => (v.estado ?? "activado") !== "desactivado")
          .map((v) => v.id),
      ),
    [vendors],
  );

  useEffect(() => {
    if (vendorId) return;
    if (selectedVendorId && !enabledVendorIds.has(selectedVendorId)) {
      setSelectedVendorId(null);
    }
  }, [vendorId, selectedVendorId, enabledVendorIds]);

  useEffect(() => {
    if (status === "confirming" && uploadMode === "merge" && !selectedVendorId) {
      setUploadMode("replace");
    }
  }, [status, uploadMode, selectedVendorId]);

  const resetState = () => {
    setStatus("idle");
    setFileName(null);
    setParsedData([]);
    setParseErrors([]);
    setUploadedCount(0);
    setMissingMasterReport(null);
    setUploadMode("replace");
    setMergeSummary(null);
    setMergeInvalidRows([]);
    setResultTab("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const vendorDisplayNameForExport = useMemo(() => {
    if (vendorNameProp?.trim()) return vendorNameProp.trim();
    if (selectedVendorId) {
      const v = vendors.find((x) => x.id === selectedVendorId);
      if (v?.nombre?.trim()) return v.nombre.trim();
    }
    return "vendor";
  }, [vendorNameProp, selectedVendorId, vendors]);

  const missingPrefixesExportFilename =
    missingMasterReport?.rows.length && missingMasterReport.exportDateSlug
      ? buildMissingMasterPrefixesFilename(vendorDisplayNameForExport, missingMasterReport.exportDateSlug)
      : null;

  const downloadMissingPrefixesXlsx = () => {
    const rows = missingMasterReport?.rows;
    const dateSlug = missingMasterReport?.exportDateSlug;
    if (!rows?.length || !dateSlug) return;
    const header = ["country", "network", "prefix"] as const;
    const aoa = [header as unknown as string[], ...rows.map((r) => [r.country, r.network, r.prefix])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Missing prefixes");
    XLSX.writeFile(wb, buildMissingMasterPrefixesFilename(vendorDisplayNameForExport, dateSlug));
  };

  const doUpload = async (data: PhoneRate[], name: string, mode: "replace" | "merge") => {
    setStatus("uploading");
    setMergeSummary(null);
    setMergeInvalidRows([]);

    if (mode === "merge" && !selectedVendorId) {
      toast.error("Merge (field update) requires a vendor.");
      setStatus("error");
      return;
    }

    const prefixToCountry = new Map<string, string>();
    const masterCanonicalKeys = new Set<string>();

    const addMasterMatch = (regionCode: unknown, countryName?: string | null) => {
      const key = canonicalPrefixForMasterMatch(String(regionCode ?? ""));
      if (!key) return;
      masterCanonicalKeys.add(key);
      const cn = countryName?.trim();
      if (cn) prefixToCountry.set(key, cn);
    };

    type RpcCanonRow = { region_code: string; country_name: string };

    const vendorCanonList = [
      ...new Set(
        data
          .map((row) => canonicalPrefixForMasterMatch(row.prefix))
          .filter((c): c is string => Boolean(c)),
      ),
    ];

    const vendorRawPrefixList = [
      ...new Set(
        data
          .map((row) => String(row.prefix ?? "").trim())
          .filter((p) => p.length > 0),
      ),
    ];

    /** Exact text match on country_regions.region_code (uses idx on region_code). */
    const EXACT_REGION_CODE_CHUNK = 250;
    if (vendorRawPrefixList.length > 0) {
      for (let i = 0; i < vendorRawPrefixList.length; i += EXACT_REGION_CODE_CHUNK) {
        const chunk = vendorRawPrefixList.slice(i, i + EXACT_REGION_CODE_CHUNK);
        const { data: exactRows, error: exactErr } = await supabase
          .from("country_regions")
          .select("region_code, countries(nombre)")
          .in("region_code", chunk);
        if (exactErr) {
          setParseErrors((prev) => [
            ...prev,
            { row: -1, message: `Master List prefix lookup: ${exactErr.message}` },
          ]);
          setStatus("error");
          return;
        }
        for (const r of exactRows ?? []) {
          const rc = (r as { region_code: string }).region_code;
          const cn = (r as { countries: { nombre: string } | null }).countries?.nombre;
          addMasterMatch(rc, cn);
        }
      }
    }

    /** Canonical SQL match (011, NFKC, etc.) — additive on top of exact. */
    const VENDOR_PREFIX_CHUNK = 2000;
    let masterPrefixRpcOk = false;
    if (vendorRawPrefixList.length > 0) {
      masterPrefixRpcOk = true;
      for (let i = 0; i < vendorRawPrefixList.length; i += VENDOR_PREFIX_CHUNK) {
        const chunk = vendorRawPrefixList.slice(i, i + VENDOR_PREFIX_CHUNK);
        const { data: chunkRows, error: chunkErr } = await supabase.rpc("resolve_vendor_prefixes_in_master", {
          p_raw_prefixes: chunk,
        });
        if (chunkErr || !Array.isArray(chunkRows)) {
          masterPrefixRpcOk = false;
          break;
        }
        for (const row of chunkRows as RpcCanonRow[]) {
          addMasterMatch(row.region_code, row.country_name);
        }
      }
    }

    // RPC failed or not deployed: paginate — do not clear (exact RPC rows already merged).
    if (!masterPrefixRpcOk && vendorCanonList.length > 0) {
      const vendorCanonSet = new Set(vendorCanonList);
      const foundInMaster = new Set([...vendorCanonSet].filter((c) => masterCanonicalKeys.has(c)));
      let offset = 0;
      const countryRegionsPage = 5000;
      while (foundInMaster.size < vendorCanonSet.size) {
        const { data: crData, error: crErr } = await supabase
          .from("country_regions")
          .select("region_code, countries(nombre)")
          .order("id", { ascending: true })
          .range(offset, offset + countryRegionsPage - 1);
        if (crErr) {
          setParseErrors((prev) => [
            ...prev,
            { row: -1, message: `Could not load Master List prefixes: ${crErr.message}` },
          ]);
          setStatus("error");
          return;
        }
        if (!crData?.length) break;
        for (const r of crData) {
          const canon = canonicalPrefixForMasterMatch(String((r as { region_code: string }).region_code ?? ""));
          if (!canon || !vendorCanonSet.has(canon)) continue;
          masterCanonicalKeys.add(canon);
          foundInMaster.add(canon);
          const country = (r as { countries: { nombre: string } | null }).countries?.nombre;
          if (country) prefixToCountry.set(canon, country);
        }
        offset += crData.length;
      }
    }

    const missingByTriple = new Map<string, MissingMasterPrefixRow>();
    const distinctMissingPrefixes = new Set<string>();
    let rowsWithMissingPrefix = 0;
    for (const row of data) {
      const canon = canonicalPrefixForMasterMatch(row.prefix);
      if (!canon || masterCanonicalKeys.has(canon)) continue;
      rowsWithMissingPrefix++;
      distinctMissingPrefixes.add(canon);
      const key = `${row.country}\t${row.network}\t${row.prefix}`;
      if (!missingByTriple.has(key)) {
        missingByTriple.set(key, { country: row.country, network: row.network, prefix: row.prefix });
      }
    }
    const missingRowsSorted = Array.from(missingByTriple.values()).sort((a, b) => {
      const c = compareText(a.country, b.country);
      if (c !== 0) return c;
      const n = compareText(a.network, b.network);
      if (n !== 0) return n;
      return compareText(a.prefix, b.prefix);
    });

    const resolveCountry = (prefix: string, vendorCountry: string): string => {
      const canon = canonicalPrefixForMasterMatch(prefix);
      return prefixToCountry.get(canon) ?? vendorCountry;
    };

    const rateRowKey = (country: string, network: string, prefix: string, rateType: string) =>
      `${country}\t${network}\t${prefix}\t${rateType}`;

    const BATCH = 100;

    const insertAllRows = async (uploadId: string, rows: PhoneRate[]) => {
      let total = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((row) => ({
          country: resolveCountry(row.prefix, row.country),
          network: row.network,
          prefix: row.prefix,
          rate: row.rate,
          rate_type: row.rate_type ?? "International",
          upload_id: uploadId,
          comment: commentForStorage(row),
        }));
        const { error } = await supabase.from("phone_rates").insert(batch);
        if (error) {
          setParseErrors((prev) => [...prev, { row: -1, message: `Save error: ${error.message}` }]);
          setStatus("error");
          return false;
        }
        total += batch.length;
        setUploadedCount(total);
      }
      return true;
    };

    const finishSuccess = () => {
      const exportDateSlug = formatExportDateSlug();
      setMissingMasterReport(
        distinctMissingPrefixes.size > 0
          ? {
              distinctPrefixCount: distinctMissingPrefixes.size,
              rowCount: rowsWithMissingPrefix,
              rows: missingRowsSorted,
              exportDateSlug,
            }
          : {
              distinctPrefixCount: 0,
              rowCount: 0,
              rows: [],
              exportDateSlug,
            },
      );
      setStatus("success");
      if (distinctMissingPrefixes.size > 0) {
        toast.warning(
          `${distinctMissingPrefixes.size} prefix${distinctMissingPrefixes.size === 1 ? "" : "es"} not in Master List (${rowsWithMissingPrefix} row${rowsWithMissingPrefix === 1 ? "" : "s"}). Open the "Prefixes not in Master List" tab to download a report.`,
          { duration: 12000 },
        );
      }
      onSuccess?.();
    };

    if (mode === "replace") {
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
          upload_mode: "replace",
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

      const ok = await insertAllRows(uploadRow.id, data);
      if (!ok) return;
      setUploadedCount(data.length);
      await finishSuccess();
      return;
    }

    // merge
    const { data: existingUpload } = await supabase
      .from("csv_uploads")
      .select("id")
      .eq("vendor_id", selectedVendorId!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingUpload?.id) {
      const { data: uploadRow, error: uploadError } = await supabase
        .from("csv_uploads")
        .insert({
          file_name: name,
          vendor_id: selectedVendorId!,
          upload_mode: "merge",
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

      const ok = await insertAllRows(uploadRow.id, data);
      if (!ok) return;
      setUploadedCount(data.length);
      setMergeSummary({ inserted: data.length, updated: 0, skipped: 0, invalid: 0 });
      await finishSuccess();
      return;
    }

    const uploadId = existingUpload.id;
    const { error: metaErr } = await supabase
      .from("csv_uploads")
      .update({ file_name: name, upload_mode: "merge" })
      .eq("id", uploadId);
    if (metaErr) {
      setParseErrors((prev) => [...prev, { row: -1, message: `Save error: ${metaErr.message}` }]);
      setStatus("error");
      return;
    }

    const existingRates: { id: string; country: string; network: string; prefix: string; rate_type: string }[] = [];
    let from = 0;
    const phoneRatesPage = 5000;
    while (true) {
      const { data: page, error: pgErr } = await supabase
        .from("phone_rates")
        .select("id, country, network, prefix, rate_type")
        .eq("upload_id", uploadId)
        .range(from, from + phoneRatesPage - 1);
      if (pgErr) {
        setParseErrors((prev) => [...prev, { row: -1, message: pgErr.message }]);
        setStatus("error");
        return;
      }
      if (!page?.length) break;
      existingRates.push(...(page as typeof existingRates));
      from += page.length;
    }

    const keyToId = new Map<string, string>();
    for (const r of existingRates) {
      keyToId.set(rateRowKey(r.country, r.network, r.prefix, r.rate_type), r.id);
    }

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
    let skipped = 0;
    let invalid = 0;
    const invalidCommentRows: PhoneRate[] = [];

    for (const row of data) {
      const country = resolveCountry(row.prefix, row.country);
      const rate_type = row.rate_type ?? "International";
      const norm = normalizeUploadComment(row.comment);
      const key = rateRowKey(country, row.network, row.prefix, rate_type);

      if (norm === null) {
        invalid++;
        invalidCommentRows.push({ ...row, country, rate_type });
        continue;
      }
      if (norm === "empty" || norm === "NO_CHANGES") {
        skipped++;
        continue;
      }

      if (norm === "NEW_BRAND") {
        toInsert.push({
          upload_id: uploadId,
          country,
          network: row.network,
          prefix: row.prefix,
          rate: row.rate,
          rate_type,
          comment: UPLOAD_COMMENT.NEW_BRAND,
        });
        continue;
      }

      if (norm === "INCREMENT" || norm === "DECREMENT") {
        const id = keyToId.get(key);
        if (!id) {
          skipped++;
          continue;
        }
        toUpdate.push({
          id,
          patch: {
            country,
            network: row.network,
            prefix: row.prefix,
            rate: row.rate,
            rate_type,
            comment: UPLOAD_COMMENT[norm],
          },
        });
      }
    }

    let done = 0;
    const totalWork = toInsert.length + toUpdate.length;

    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from("phone_rates").upsert(chunk, {
        onConflict: "upload_id,country,network,prefix,rate_type",
        ignoreDuplicates: false,
      });
      if (error) {
        setParseErrors((prev) => [...prev, { row: -1, message: `Save error: ${error.message}` }]);
        setStatus("error");
        return;
      }
      done += chunk.length;
      setUploadedCount(done);
    }

    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const chunk = toUpdate.slice(i, i + BATCH);
      const results = await Promise.all(
        chunk.map((u) => supabase.from("phone_rates").update(u.patch).eq("id", u.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        setParseErrors((prev) => [...prev, { row: -1, message: `Save error: ${failed.error.message}` }]);
        setStatus("error");
        return;
      }
      done += chunk.length;
      setUploadedCount(done);
    }

    setMergeSummary({
      inserted: toInsert.length,
      updated: toUpdate.length,
      skipped,
      invalid,
    });
    setMergeInvalidRows(invalidCommentRows);
    if (invalid > 0) {
      toast.warning(
        `${invalid} row${invalid === 1 ? "" : "s"} had an invalid comment (use: No changes, Increment, Decrement, New brand).`,
        { duration: 8000 },
      );
    }
    if (totalWork === 0) {
      toast.info("No rows to apply (all lines were No changes or empty comment).");
    }
    setUploadedCount(totalWork);
    await finishSuccess();
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

  const renderDropZone = () => (
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
      <div className={`flex flex-col items-center gap-4 text-center ${compact ? "py-8 px-6" : "py-12 px-8"}`}>
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
            <div className="w-full max-w-md space-y-3">
              <p className="text-lg font-semibold text-success">
                {mergeSummary
                  ? mergeSummary.inserted + mergeSummary.updated > 0
                    ? `${mergeSummary.inserted + mergeSummary.updated} rows applied`
                    : "No changes applied"
                  : `${uploadedCount} records saved!`}
              </p>
              {mergeSummary ? (
                <p className="text-xs text-muted-foreground text-left">
                  {mergeSummary.inserted} added, {mergeSummary.updated} updated, {mergeSummary.skipped} skipped
                  {mergeSummary.invalid > 0 ? `, ${mergeSummary.invalid} invalid comment` : ""}.
                </p>
              ) : null}
              {mergeInvalidRows.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full h-auto min-h-8 flex-col gap-1 py-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadInvalidCommentRowsXlsx(mergeInvalidRows, fileName);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <FileDown className="w-4 h-4 shrink-0" />
                    Download invalid comment rows (XLSX)
                  </span>
                  {fileName ? (
                    <span className="w-full break-all text-center font-mono text-[11px] font-normal leading-tight text-muted-foreground">
                      {buildInvalidCommentFilename(
                        fileName.replace(/\.[^.]+$/i, ""),
                        formatExportDateSlug(),
                      )}
                    </span>
                  ) : null}
                </Button>
              ) : null}
              <p className="text-sm text-muted-foreground">{fileName}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  resetState();
                }}
                className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-destructive transition-colors pt-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Upload another file
              </button>
              {!showMissingPrefixesTab && missingMasterReport ? (
                <p className="text-xs text-muted-foreground">
                  All prefixes in this file exist in the Master List.
                </p>
              ) : null}
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
  );

  return (
    <>
      {/* Confirmation Dialog */}
      <AlertDialog open={status === "confirming"}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm upload</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  You are about to import <strong className="text-foreground">{parsedData.length} records</strong> from{" "}
                  <span className="font-mono">{fileName}</span>
                  {selectedVendorId ? " for the selected vendor." : "."}
                </p>
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-left">
                  <Label className="text-foreground text-xs font-semibold uppercase tracking-wide">
                    Import mode
                  </Label>
                  <RadioGroup
                    value={uploadMode}
                    onValueChange={(v) => setUploadMode(v === "merge" ? "merge" : "replace")}
                    className="gap-3"
                  >
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="replace" id="um-replace" className="mt-0.5" />
                      <label htmlFor="um-replace" className="cursor-pointer leading-snug">
                        <span className="font-medium text-foreground">Replace entire file</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Remove this vendor&apos;s current upload and insert every row from the file. Optional{" "}
                          <code className="text-[11px]">comment</code> column is stored as-is.
                        </span>
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem
                        value="merge"
                        id="um-merge"
                        className="mt-0.5"
                        disabled={!selectedVendorId}
                      />
                      <label
                        htmlFor="um-merge"
                        className={`leading-snug ${!selectedVendorId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span className="font-medium text-foreground">Field update (merge)</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Requires a vendor. Add a <code className="text-[11px]">comment</code> column with:{" "}
                          <em>No changes</em>, <em>Increment</em>, <em>Decrement</em>, or <em>New brand</em>.{" "}
                          No changes = skip; New brand = add prefix; Increment/Decrement = update matching row.
                        </span>
                      </label>
                    </div>
                  </RadioGroup>
                </div>
                <p className="text-xs">Continue?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetState}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doUpload(parsedData, fileName ?? "import.csv", uploadMode)}>
              Yes, import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={`w-full mx-auto space-y-6 ${compact ? "max-w-md" : "max-w-2xl"}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          aria-hidden
          onChange={onFileChange}
        />
        {/* Vendor selector - hidden when vendorId is provided */}
        {!vendorId && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label htmlFor="vendor-select" className="shrink-0">Vendor for this file</Label>
              <Select
                value={selectedVendorId ?? "__none__"}
                onValueChange={(value) => setSelectedVendorId(value === "__none__" ? null : value)}
              >
                <SelectTrigger id="vendor-select" className="w-[200px]">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {vendors
                    .filter((v) => (v.estado ?? "activado") !== "desactivado")
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              The selected vendor will be assigned to the CSV or XLSX file you upload.
            </p>
          </div>
        )}

        {showResultTabs ? (
          <div className="space-y-3">
            <div
              role="tablist"
              aria-label="Upload results"
              className="inline-flex h-auto min-h-10 w-full flex-wrap items-center justify-start gap-1 rounded-md bg-muted p-1 text-muted-foreground"
            >
              <button
                type="button"
                role="tab"
                aria-selected={resultTab === "upload"}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-all sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  resultTab === "upload"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setResultTab("upload")}
              >
                Upload
              </button>
              {showErrorsTab ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={resultTab === "errors"}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-all sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    resultTab === "errors"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setResultTab("errors")}
                >
                  Errors
                </button>
              ) : null}
              {showMissingPrefixesTab ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={resultTab === "missing_prefixes"}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-all sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    resultTab === "missing_prefixes"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setResultTab("missing_prefixes")}
                >
                  Prefixes not in Master List
                </button>
              ) : null}
            </div>
            <div className="mt-1">
              {resultTab === "upload" ? (
                <div role="tabpanel" aria-label="Upload">
                  {renderDropZone()}
                </div>
              ) : null}
              {resultTab === "errors" && showErrorsTab ? (
                <div role="tabpanel" aria-label="Errors" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Download an XLSX with all affected rows and full error messages ({parseErrors.length} total).
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadParseErrorsXlsx(parseErrors, fileName);
                    }}
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Download errors (XLSX)
                  </Button>
                </div>
              ) : null}
              {resultTab === "missing_prefixes" && showMissingPrefixesTab && missingMasterReport ? (
                <div role="tabpanel" aria-label="Prefixes not in Master List" className="space-y-3">
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-left text-sm text-foreground space-y-2">
                    <p>
                      <strong>{missingMasterReport.distinctPrefixCount}</strong>{" "}
                      {missingMasterReport.distinctPrefixCount === 1 ? "prefix is" : "prefixes are"} not in the Master List
                      {missingMasterReport.rowCount !== missingMasterReport.distinctPrefixCount
                        ? ` (${missingMasterReport.rowCount} rows)`
                        : ""}
                      .
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Add matching region codes in Master List so rates align with your reference data.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full h-auto min-h-8 flex-col gap-1.5 py-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadMissingPrefixesXlsx();
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <FileDown className="w-4 h-4 shrink-0" />
                        Download XLSX
                      </span>
                      {missingPrefixesExportFilename ? (
                        <span className="w-full break-all text-center font-mono text-[11px] font-normal leading-tight text-muted-foreground">
                          {missingPrefixesExportFilename}
                        </span>
                      ) : null}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          renderDropZone()
        )}
      </div>
    </>
  );
}
