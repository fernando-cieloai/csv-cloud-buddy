#!/usr/bin/env node
/**
 * Lee `src/Grete Local Trunk Rates (1).xlsx` y escribe un TSV con el resumen por país (ISO)
 * y tipo de línea (Mobile / Fixed / Other), alineado con:
 * - `quotation_country_direct_iso_prefix` (cabecera de país antes de `-`)
 * - `classifyQuotationNetworkLineType` en src/lib/quotationNetworkSummary.ts
 *
 * Salida por defecto: reports/Grete_Local_Trunk_Rates_country_line_summary.tsv
 */

import XLSX from 'xlsx';
import countries from 'i18n-iso-countries';
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const require = createRequire(import.meta.url);
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

/** Igual que SQL `quotation_country_direct_iso_prefix` (primer segmento, espacios colapsados). */
function countryIsoFromCountryColumn(p_country) {
  const head = String(p_country ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split('-')[0]
    .trim()
    .toLowerCase();
  const map = {
    mexico: 'mx',
    argentina: 'ar',
    chile: 'cl',
    colombia: 'co',
    ecuador: 'ec',
    peru: 'pe',
    panama: 'pa',
    brazil: 'br',
    brasil: 'br',
    canada: 'ca',
    nicaragua: 'ni',
    'costa rica': 'cr',
    usa: 'us',
    'united states': 'us',
    'united states of america': 'us',
    'dominican republic': 'do',
    guatemala: 'gt',
    honduras: 'hn',
    'el salvador': 'sv',
    paraguay: 'py',
    uruguay: 'uy',
    bolivia: 'bo',
    venezuela: 've',
  };
  return map[head] ?? null;
}

function lineType(network) {
  const n = String(network ?? '').toLowerCase();
  if (n.includes('mobile') || n.includes('cellular')) return 'Mobile';
  if (/\b(special|rural|other)\b/i.test(String(network ?? ''))) return 'Other';
  return 'Fixed';
}

function asciiUpperNoMarks(s) {
  return String(s)
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

function countryLabelForIso(isoLower) {
  const iso = String(isoLower).toUpperCase();
  const n = countries.getName(iso, 'en');
  return n ? asciiUpperNoMarks(n) : iso;
}

function col(r, ...names) {
  for (const n of names) {
    if (r[n] !== undefined && r[n] !== '') return r[n];
  }
  return '';
}

const inputPath = join(root, 'src', 'Grete Local Trunk Rates (1).xlsx');
const outPath = join(root, 'reports', 'Grete_Local_Trunk_Rates_country_line_summary.tsv');

const buf = readFileSync(inputPath);
const wb = XLSX.read(buf, { type: 'buffer' });
const sh = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sh, { defval: '' });

const byKey = new Map();
let skippedUnknown = 0;

for (const r of rows) {
  const country = String(col(r, 'Country', 'country')).trim();
  const network = String(col(r, 'Network', 'network')).trim();
  const prefixRaw = col(r, 'Prefix', 'prefix');
  const rateRaw = col(r, 'Rate', 'rate');

  if (!country && !network && prefixRaw === '' && rateRaw === '') continue;
  if (String(country).toLowerCase() === 'country') continue;

  const iso = countryIsoFromCountryColumn(country);
  if (!iso) {
    skippedUnknown++;
    continue;
  }
  const lt = lineType(network);
  const key = `${iso}\t${lt}`;
  if (!byKey.has(key)) byKey.set(key, { rates: [], prefixes: new Set() });
  const g = byKey.get(key);
  const rate = Number(rateRaw);
  if (!Number.isFinite(rate)) continue;
  g.rates.push(rate);
  const p = String(prefixRaw).trim();
  if (p) g.prefixes.add(p);
}

const fmt = (x) => (x == null ? '' : Number(x).toFixed(3));
const orderLt = (t) => (t === 'Mobile' ? 0 : t === 'Fixed' ? 1 : 2);

const lines = [];
lines.push(['Country', 'ISO', 'LineType', 'Min', 'Max', 'Avg', 'PrefixCount'].join('\t'));

const sorted = [...byKey.entries()].sort((a, b) => {
  const [isoA, ltA] = a[0].split('\t');
  const [isoB, ltB] = b[0].split('\t');
  const c = isoA.localeCompare(isoB);
  if (c !== 0) return c;
  return orderLt(ltA) - orderLt(ltB);
});

for (const [k, v] of sorted) {
  const [iso, lt] = k.split('\t');
  const rates = v.rates;
  const min = rates.length ? Math.min(...rates) : null;
  const max = rates.length ? Math.max(...rates) : null;
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const label = countryLabelForIso(iso);
  lines.push([label, iso.toUpperCase(), lt, fmt(min), fmt(max), fmt(avg), String(v.prefixes.size)].join('\t'));
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

console.log(`Wrote ${outPath} (${sorted.length} data rows + header)`);
if (skippedUnknown) console.log(`Skipped ${skippedUnknown} rows with unknown country (not in SQL country map)`);
