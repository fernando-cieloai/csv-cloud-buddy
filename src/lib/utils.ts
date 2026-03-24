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

/** Format a percentage for display (e.g. margin on cost). */
export function formatPercent(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}
