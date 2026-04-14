/**
 * Canonical form for matching vendor/rate prefixes to Master List `region_code`
 * when international access code `011` (or `11`-style variants) is present.
 *
 * Examples: `011832`, `11832`, `0110832`, and `832` align to the same key when
 * the master stores `832` or `52`.
 */

/** Trim, strip leading +, remove whitespace (common in Excel). */
export function normalizePrefixRaw(prefix: string): string {
  let s = String(prefix ?? "")
    .trim()
    .replace(/^\+/, "")
    .replace(/\s+/g, "")
    // Excel "force text" marker when the cell is still a string
    .replace(/^['\u2018\u2019]+/, "")
    // Zero-width / BOM (often break exact string matches vs master list)
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "");

  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }

  // Unicode "Format" chars (LRM/RLM, word joiner, etc.) — not matched by \s; break exact match vs DB.
  try {
    s = s.replace(/\p{Cf}/gu, "");
  } catch {
    s = s.replace(/[\u200E\u200F\u061C\u2066-\u2069\u206A-\u206F]/g, "");
  }

  // US-style thousands from formatted cells: "9,370" → "9370" (must not match "93,70").
  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, "");
  }

  // CSV / spreadsheet exports often use "9370.0" while the master list stores "9370".
  if (/^\d+\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && Number.isSafeInteger(n) && n >= 0) {
      s = String(n);
    }
  }

  return s;
}

export function canonicalPrefixForMasterMatch(prefix: string): string {
  let n = normalizePrefixRaw(prefix);
  if (!n) return "";

  // Ignore only one initial IDD combination for matching:
  // 0112343 -> 2343 and 112343 -> 2343.
  if (n.startsWith("011")) {
    n = n.slice(3);
  } else if (n.startsWith("11")) {
    n = n.slice(2);
  }

  // National trunk zeros after IDD strip: 011052 → 052 → 52; align with master "52".
  while (/^\d+$/.test(n) && n.startsWith("0") && n.length > 1) {
    n = n.slice(1);
  }

  return n;
}

/** @deprecated use normalizePrefixRaw */
export function stripPlusAndTrim(prefix: string): string {
  return normalizePrefixRaw(prefix);
}
