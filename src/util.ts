/**
 * Format a numeric value for display: null/NaN/±∞ → "—", otherwise
 * locale-formatted with fraction digits that scale by magnitude (fewer for larger numbers).
 */
export function formatVal(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";

  let n = v;
  let neg = false;
  if (n < 0) {
    n = Math.abs(n);
    neg = true;
  }

  // Fewer fraction digits for larger magnitudes
  let frac = 4;
  for (let v2 = n; frac > 0 && v2 >= 10; frac--, v2 /= 10);
  frac = Math.max(0, frac);

  return (
    (neg ? "−" : "") +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: frac,
      maximumFractionDigits: frac,
    }).format(n)
  );
}

/**
 * Return the range (max - min) of non-null values, or 0 if none.
 */
export function range(values: (number | null)[]): number {
  let min: number | null = null;
  let max: number | null = null;
  for (const v of values) {
    if (v == null) continue;
    if (min == null || v < min) min = v;
    if (max == null || v > max) max = v;
  }
  return min != null && max != null ? max - min : 0;
}
