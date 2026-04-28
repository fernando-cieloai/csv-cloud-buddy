import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

/** Aliases seen in CSVs / DB that differ from ISO English names */
const ALIASES: Record<string, string> = {
  USA: "US",
  "UNITED STATES OF AMERICA": "US",
  UK: "GB",
  "GREAT BRITAIN": "GB",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
};

let localeRegistered = false;

/** Required in the browser: without it `getAlpha2Code` / `getName` return undefined. */
export function ensureCountriesLocale(): void {
  if (localeRegistered) return;
  countries.registerLocale(enLocale);
  localeRegistered = true;
}

function asciiUpperNoMarks(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

/**
 * Raw token from vendor label (must stay aligned with SQL `quotation_country_filter_token`):
 * — segment before first hyphen (MX-TELCEL → MX),
 * — else leading ISO-like AA + space/dash/end (AD FIXED → AD),
 * — else first whitespace-separated word (COLOMBIA MOBILE → COLOMBIA).
 */
export function quotationCountryCanonicalToken(raw: string): string {
  ensureCountriesLocale();
  const ascii = asciiUpperNoMarks((raw ?? "").trim());
  if (!ascii) return "";

  const dashIdx = ascii.indexOf("-");
  if (dashIdx >= 0) {
    return ascii.slice(0, dashIdx).trim();
  }

  const isoLead = /^([A-Z]{2})(?=\s|-|$)/.exec(ascii);
  if (isoLead && countries.getName(isoLead[1], "en")) {
    return isoLead[1];
  }

  const spaceIdx = ascii.indexOf(" ");
  if (spaceIdx > 0) {
    return ascii.slice(0, spaceIdx).trim();
  }

  return ascii;
}

/**
 * Stable key for filters / summary: ISO alpha-2 when the English name resolves to one,
 * otherwise the token (AR for Argentina; AD for Andorra vendor prefixes).
 */
export function quotationCountryCanonicalKey(raw: string): string {
  ensureCountriesLocale();
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  const asciiFull = asciiUpperNoMarks(trimmed);
  const directIso =
    countries.getAlpha2Code(trimmed, "en") ?? countries.getAlpha2Code(asciiFull, "en");
  if (directIso) return directIso.toUpperCase();

  const token = quotationCountryCanonicalToken(raw);
  if (!token) return "";

  const fromEnglish = countries.getAlpha2Code(token, "en");
  if (fromEnglish) return fromEnglish.toUpperCase();

  if (/^[A-Z]{2}$/.test(token) && countries.getName(token, "en")) return token;

  return token;
}

/** Human label for picker / tables: ANDORRA instead of AD; works when key is ISO or English name token. */
export function quotationCountryPickerLabel(canonicalKey: string): string {
  ensureCountriesLocale();
  const k = canonicalKey.trim().toUpperCase();
  if (!k) return "";

  let iso = ALIASES[k];
  if (!iso && /^[A-Z]{2}$/.test(k) && countries.getName(k, "en")) iso = k;
  if (!iso) {
    const resolved = countries.getAlpha2Code(k, "en");
    if (resolved && countries.getName(resolved, "en")) iso = resolved;
  }

  if (iso && countries.getName(iso, "en")) {
    return asciiUpperNoMarks(countries.getName(iso, "en")!);
  }

  return k;
}

/**
 * @deprecated use quotationCountryCanonicalKey — kept for existing imports.
 * Normalized country key for aggregation (ISO when possible).
 */
export function quotationSummaryCountryBaseKey(raw: string): string {
  return quotationCountryCanonicalKey(raw);
}

/** ISO 3166-1 alpha-2 for the summary base country, or null when unknown */
export function isoAlpha2ForQuotationCountryBase(baseKeyUpper: string): string | null {
  ensureCountriesLocale();
  const key = baseKeyUpper.trim().toUpperCase();
  if (!key) return null;
  const alias = ALIASES[key];
  if (alias) return alias;
  if (/^[A-Z]{2}$/.test(key) && countries.getName(key, "en")) return key;
  const fromLib = countries.getAlpha2Code(key, "en");
  return fromLib ?? null;
}

/**
 * Expands user-selected country labels into all tokens used in `country_filter_key`
 * (country column, first network segment like MX/AR, English names ↔ ISO).
 * Pass this set to RPC `p_country_filter` and `buildTableRowsFromAggregated`.
 */
export function expandCountryLabelsForMatching(selected: Iterable<string>): Set<string> {
  ensureCountriesLocale();
  const out = new Set<string>();
  const addLower = (s: string | undefined | null) => {
    const t = (s ?? "").trim().toLowerCase();
    if (t) out.add(t);
  };

  for (const raw of selected) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    addLower(trimmed);
    const upper = asciiUpperNoMarks(trimmed);

    const aliasIso = ALIASES[upper];
    if (aliasIso) addLower(aliasIso);

    const isoFromEnglish =
      countries.getAlpha2Code(trimmed, "en") ?? countries.getAlpha2Code(upper, "en");
    if (isoFromEnglish) addLower(isoFromEnglish);

    const canon = quotationCountryCanonicalKey(trimmed);
    if (canon) {
      addLower(canon);
      if (/^[A-Z]{2}$/.test(canon) && countries.getName(canon, "en")) {
        addLower(canon);
        const official = countries.getName(canon, "en", { select: "official" });
        if (typeof official === "string") addLower(official);
        const all = countries.getName(canon, "en", { select: "all" });
        if (Array.isArray(all)) for (const n of all) addLower(n as string);
      }
    }
  }

  return out;
}
