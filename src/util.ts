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
 * Sanitize a string for use as a filename (e.g. column names like "Inerti-Vel (ft/sec)").
 */
export function sanitizeFileName(name: string, dflt: string): string {
  const s = name.trim().replace(/[/\\:*?"<>|]+/g, "_");
  return s === "" ? dflt : s;
}

/** File extension for export format (JPEG uses "jpg"). */
export const EXPORT_EXT: Record<"png" | "jpeg", string> = {
  png: "png",
  jpeg: "jpg",
};

/** Dialog filter label per export format (e.g. save dialog). */
export const EXPORT_FORMAT_LABEL: Record<"png" | "jpeg", string> = {
  png: "PNG image",
  jpeg: "JPEG image",
};

/** Convert unknown throw value to a short message for user-facing errors. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Options for ECharts getDataURL() when exporting charts. */
export const CHART_EXPORT_DATA_URL_OPTS = {
  pixelRatio: 2,
  backgroundColor: "#fff",
} as const;

/** Special chart selection ID used to render the location trace map. */
export const MAP_TRACE_SELECTION = "__map_trace__";

/** User-facing label for the location trace map chart. */
export const MAP_TRACE_LABEL = "Map Trace";

/** Special chart selection ID for longitude (X) vs latitude (Y) line chart. */
export const LAT_LONG_LINE_SELECTION = "__lat_long_line__";

/** User-facing label for the lat/long line chart. */
export const LAT_LONG_LINE_LABEL = "Latitude vs Longitude";

export function isMapTraceSelection(name: string): boolean {
  return name === MAP_TRACE_SELECTION;
}

export function isLatLongLineSelection(name: string): boolean {
  return name === LAT_LONG_LINE_SELECTION;
}

/** Special chart selection ID for the 3D globe trace. */
export const GLOBE_TRACE_SELECTION = "__globe_trace__";

/** User-facing label for the 3D globe trace chart. */
export const GLOBE_TRACE_LABEL = "Globe Trace";

export function isGlobeTraceSelection(name: string): boolean {
  return name === GLOBE_TRACE_SELECTION;
}

/**
 * Decode a PNG/JPEG data URL to bytes, or null if invalid.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  if (dataUrl == null || typeof dataUrl !== "string" || !dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(?:png|jpeg);base64,(.+)$/);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
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
