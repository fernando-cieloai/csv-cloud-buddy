import * as XLSX from "xlsx";

/** Headers for the vendor rate template (row 1). */
export const VENDOR_TEMPLATE_HEADERS = [
  "Country",
  "Network",
  "Prefix",
  "Rate",
  "Effective Date",
  "Initial Increment",
  "Next Increment",
] as const;

/** Sheet names for International, Origin Based, and Local rates. */
export const VENDOR_TEMPLATE_SHEET_NAMES = [
  "International",
  "Origin Based",
  "Local",
] as const;

/** Headers for quotation export/download (matches template order). */
export const QUOTATION_EXPORT_HEADERS = [
  "Country",
  "Type",
  "Rate",
  "Effective Date",
  "Initial Increment",
  "Next Increment",
] as const;

/** Default values for quotation snapshot when not set. */
export const QUOTATION_DEFAULTS = {
  getEffectiveDate: () => new Date().toISOString().slice(0, 10),
  initialIncrement: 6,
  nextIncrement: 6,
} as const;

/**
 * Creates and downloads an XLSX template for vendors without a specific format.
 * Always has 3 sheets (International, Origin Based, Local).
 * Headers in row 1: Country, Network, Prefix, Rate, Effective Date, Initial Increment, Next Increment.
 */
export function downloadVendorTemplate(): void {
  const wb = XLSX.utils.book_new();

  for (const sheetName of VENDOR_TEMPLATE_SHEET_NAMES) {
    const wsData: (string | number)[][] = [
      [...VENDOR_TEMPLATE_HEADERS],
      ["Mexico", "Telcel", "+52", 0.025, "2024-01-01", 6, 6],
      ["USA", "AT&T", "+1", 0.018, "2024-01-01", 6, 6],
      ["Spain", "Movistar", "+34", 0.032, "2024-01-01", 6, 6],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, "vendor-rates-template.xlsx");
}
