/** Strip optional Release / v prefix, then take leading dotted numeric version (major.minor[.patch…]). */
export function parseDisplayVersion(raw: string): string | null {
  const cleaned = raw.trim().replace(/^(?:release\s*)?(?:v\s*)?/i, "");
  const m = cleaned.match(/^(\d+(?:\.\d+)+)\b/);
  if (!m) return null;
  const core = m[1];
  const parts = core.split(".");
  if (parts.length < 2) return null;
  for (const p of parts) {
    if (p === "" || !/^\d+$/.test(p)) return null;
  }
  return core;
}

export function parseReleaseNameToDisplayVersion(name: string): string | null {
  return parseDisplayVersion(name);
}

/** >0 if a > b, <0 if a < b, 0 if equal (shorter padded with zeros). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10));
  const pb = b.split(".").map((x) => parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}
