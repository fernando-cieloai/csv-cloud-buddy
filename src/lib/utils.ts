import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round a number up to 3 decimal places. Used for rates in tables and exports. */
export function roundUpTo3Decimals(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.ceil(n * 1000) / 1000;
}

/** Format a rate for display: rounded up to 3 decimals, shown with 3 decimal places. */
export function formatRate(n: number): string {
  return roundUpTo3Decimals(n).toFixed(3);
}

/**
 * Format rates for intermediate quotation columns: no ceil; at least 3 decimal places, more if needed.
 */
export function formatRateFull(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(12).replace(/\.?0+$/, "");
  if (!s.includes(".")) return `${s}.000`;
  const [intPart, frac = ""] = s.split(".");
  const fracOut = frac.length < 3 ? frac.padEnd(3, "0") : frac;
  return `${intPart}.${fracOut}`;
}

/** Margin ($) in quotation table: 3 decimal places so small margins don’t show as 0 while % still reads e.g. 1.85%. */
export function formatMarginAmount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(3);
}

/** Format a percentage for display (e.g. margin on cost). */
export function formatPercent(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}
