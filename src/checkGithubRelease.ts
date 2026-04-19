import { getVersion } from "@tauri-apps/api/app";
import { compareSemver, parseDisplayVersion, parseReleaseNameToDisplayVersion } from "./versionCompare";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/johncoker/roview/releases";

export type ReleaseCheckResult =
  | { status: "newer"; latestDisplay: string; currentDisplay: string }
  | { status: "upToDate"; version: string }
  | { status: "failed" };

export async function checkReleaseAgainstApp(options?: {
  signal?: AbortSignal;
}): Promise<ReleaseCheckResult> {
  const signal = options?.signal;

  let currentRaw: string;
  try {
    currentRaw = await getVersion();
  } catch {
    return { status: "failed" };
  }

  const currentDisplay = parseDisplayVersion(currentRaw);
  if (currentDisplay === null) {
    return { status: "failed" };
  }

  let releases: unknown;
  try {
    const res = await fetch(GITHUB_RELEASES_URL, { signal });
    if (!res.ok) {
      return { status: "failed" };
    }
    releases = await res.json();
  } catch {
    return { status: "failed" };
  }

  if (!Array.isArray(releases) || releases.length === 0) {
    return { status: "failed" };
  }

  const latestEntry = releases.find(
    (r): r is { name?: unknown; draft?: unknown } =>
      r != null && typeof r === "object" && (r as { draft?: boolean }).draft !== true,
  );
  if (!latestEntry || typeof latestEntry !== "object") {
    return { status: "failed" };
  }

  const name = (latestEntry as { name?: unknown }).name;
  if (typeof name !== "string") {
    return { status: "failed" };
  }

  const latestDisplay = parseReleaseNameToDisplayVersion(name);
  if (latestDisplay === null) {
    return { status: "failed" };
  }

  const cmp = compareSemver(latestDisplay, currentDisplay);
  if (cmp > 0) {
    return { status: "newer", latestDisplay, currentDisplay };
  }
  return { status: "upToDate", version: currentDisplay };
}
