import {
  isoAlpha2ForQuotationCountryBase,
  quotationSummaryCountryBaseKey,
} from "./quotationCountrySummaryIso";

/**
 * Line type for summary table: Mobile (cellular/mobile in network name), Fixed default,
 * Other (special / other / rural keywords).
 */
export type QuotationSummaryLineType = "Mobile" | "Fixed" | "Other";

export function classifyQuotationNetworkLineType(networkLabel: string): QuotationSummaryLineType {
  const n = networkLabel.toLowerCase();
  if (n.includes("mobile") || n.includes("cellular")) return "Mobile";
  if (/\b(special|rural|other)\b/i.test(networkLabel)) return "Other";
  return "Fixed";
}

export interface NetworkSummaryRow {
  /** Base country label (before first hyphen), uppercase — e.g. ARGENTINA for ARGENTINA-CORDOBA */
  country: string;
  /** ISO 3166-1 alpha-2 when resolvable from base name */
  isoCode: string | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  prefixCount: number;
  lineType: QuotationSummaryLineType;
}

interface VendorCellLike {
  prefixes?: string[];
  rate?: number;
}

interface SummarySourceRow {
  country: string;
  networkLabel: string;
  byVendor: Map<string, Partial<Record<string, VendorCellLike>>>;
}

export type NetworkSummaryOptions = {
  /** Map raw vendor rate → value for Min/Max/Avg (default: raw rate). Use sell incl. PSF + markup to match quotation table. */
  valueFromRawRate?: (rawRate: number) => number | null;
};

function collectValuesForSelectedColumns(
  row: SummarySourceRow,
  selectedColumns: { vendor: { id: string }; rateType: string }[],
  valueFromRawRate?: (rawRate: number) => number | null,
): number[] {
  const values: number[] = [];
  for (const col of selectedColumns) {
    const r = row.byVendor.get(col.vendor.id)?.[col.rateType]?.rate;
    if (r == null || Number.isNaN(r) || r < 0) continue;
    const v = valueFromRawRate ? valueFromRawRate(r) : r;
    if (v != null && !Number.isNaN(v)) values.push(v);
  }
  return values;
}

function lineTypeRank(t: QuotationSummaryLineType): number {
  return t === "Mobile" ? 0 : t === "Fixed" ? 1 : 2;
}

/** One row per country + line type (Mobile/Fixed/Other); min/max/avg over all networks of that type; prefixes = distinct count across merged rows. */
export function buildNetworkSummaryRows(
  detailRows: SummarySourceRow[],
  selectedColumns: { vendor: { id: string }; rateType: string }[],
  options?: NetworkSummaryOptions,
): NetworkSummaryRow[] {
  const valueFromRawRate = options?.valueFromRawRate;
  const groupKeys = new Map<
    string,
    { baseCountryKey: string; lineType: QuotationSummaryLineType }
  >();
  for (const row of detailRows) {
    const baseCountryKey = quotationSummaryCountryBaseKey(row.country ?? "");
    if (!baseCountryKey) continue;
    const lineType = classifyQuotationNetworkLineType(row.networkLabel ?? "");
    const key = `${baseCountryKey}\t${lineType}`;
    if (!groupKeys.has(key)) groupKeys.set(key, { baseCountryKey, lineType });
  }

  const out: NetworkSummaryRow[] = [];
  for (const [, meta] of groupKeys) {
    const rowsInGroup = detailRows.filter((r) => {
      if (quotationSummaryCountryBaseKey(r.country ?? "") !== meta.baseCountryKey) return false;
      return classifyQuotationNetworkLineType(r.networkLabel ?? "") === meta.lineType;
    });
    const rates: number[] = [];
    const prefixes = new Set<string>();
    for (const row of rowsInGroup) {
      rates.push(...collectValuesForSelectedColumns(row, selectedColumns, valueFromRawRate));
      for (const col of selectedColumns) {
        const cell = row.byVendor.get(col.vendor.id)?.[col.rateType];
        for (const p of cell?.prefixes ?? []) {
          const t = p.trim();
          if (t) prefixes.add(t);
        }
      }
    }
    let min: number | null = null;
    let max: number | null = null;
    let avg: number | null = null;
    if (rates.length > 0) {
      min = Math.min(...rates);
      max = Math.max(...rates);
      avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
    out.push({
      country: meta.baseCountryKey,
      isoCode: isoAlpha2ForQuotationCountryBase(meta.baseCountryKey),
      min,
      max,
      avg,
      prefixCount: prefixes.size,
      lineType: meta.lineType,
    });
  }

  out.sort(
    (a, b) =>
      a.country.localeCompare(b.country) ||
      lineTypeRank(a.lineType) - lineTypeRank(b.lineType),
  );
  return out;
}
