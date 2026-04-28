#!/usr/bin/env node
/**
 * Prints TSV: country_iso, line_type, min, max, avg, prefix_count
 * (same grouping as summarize_phone_rates_by_iso_line_type).
 *
 * Usage:
 *   node scripts/print-phone-rates-summary.mjs
 *   node scripts/print-phone-rates-summary.mjs --vendor-id <uuid>
 *   node scripts/print-phone-rates-summary.mjs --upload-id <uuid>
 *
 * Requires .env with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 * Apply migration 20260421220000_summarize_phone_rates_iso_line_type.sql first (db:push).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const txt = readFileSync(join(root, '.env'), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function parseArgs() {
  const a = process.argv.slice(2);
  let vendorId = null;
  let uploadId = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--vendor-id' && a[i + 1]) {
      vendorId = a[++i];
    } else if (a[i] === '--upload-id' && a[i + 1]) {
      uploadId = a[++i];
    }
  }
  return { vendorId, uploadId };
}

const { URL: url, PUBLISHABLE_KEY: key } = loadEnv();
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

const { vendorId, uploadId } = parseArgs();
const supabase = createClient(url, key);

const { data, error } = await supabase.rpc('summarize_phone_rates_by_iso_line_type', {
  p_vendor_id: vendorId,
  p_upload_id: uploadId,
});

if (error) {
  console.error(error.message);
  process.exit(1);
}

const fmt = (x) => (x == null ? '' : Number(x).toFixed(3));
for (const r of data ?? []) {
  console.log(
    [
      String(r.country_iso ?? '').toUpperCase(),
      r.line_type,
      fmt(r.min_rate),
      fmt(r.max_rate),
      fmt(r.avg_rate),
      r.prefix_count,
    ].join('\t'),
  );
}
