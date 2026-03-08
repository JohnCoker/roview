import { useState } from "react";
import { open as openDialog, save as saveDialog, message as showMessage } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";
import type { ECharts } from "echarts";
import {
  sanitizeFileName,
  dataUrlToBytes,
  errorMessage,
  EXPORT_EXT,
  CHART_EXPORT_DATA_URL_OPTS,
} from "./util";

const FORMATS = [
  { value: "png" as const, label: "PNG" },
  { value: "jpeg" as const, label: "JPEG" },
];

export type ExportFormat = "png" | "jpeg";

/** Build unique filenames; if prefix provided, use "prefix name.ext". */
function buildFileNames(chartNames: string[], format: ExportFormat, prefix: string): string[] {
  const ext = EXPORT_EXT[format];
  const baseNames = chartNames.map((name) => sanitizeFileName(name, "chart"));
  const seen = new Set<string>();
  return baseNames.map((base) => {
    let name = base;
    let n = 0;
    while (seen.has(name)) {
      n++;
      name = `${base}-${n}`;
    }
    seen.add(name);
    const full = prefix ? `${prefix} ${name}` : name;
    return `${full}.${ext}`;
  });
}

/** Get image bytes for each chart; returns null if any step fails (caller should have shown message). */
async function getChartImages(
  charts: ECharts[],
  chartNames: string[],
  format: ExportFormat,
  prefix: string,
  showMessage: (msg: string, opts: { title: string; kind: "error" }) => Promise<unknown>,
): Promise<{ name: string; bytes: Uint8Array }[] | null> {
  const count = Math.min(charts.length, chartNames.length);
  const names = buildFileNames(chartNames.slice(0, count), format, prefix);
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    let dataUrl: string;
    try {
      dataUrl = charts[i].getDataURL({ type: format, ...CHART_EXPORT_DATA_URL_OPTS });
    } catch (e) {
      await showMessage(
        `Export failed for chart "${chartNames[i]}": ${errorMessage(e)}`,
        { title: "Export error", kind: "error" },
      );
      return null;
    }
    if (dataUrl == null || typeof dataUrl !== "string") {
      await showMessage(`Chart "${chartNames[i]}" returned no image data.`, {
        title: "Export error",
        kind: "error",
      });
      return null;
    }
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) {
      await showMessage("Could not decode chart image.", { title: "Export error", kind: "error" });
      return null;
    }
    results.push({ name: names[i], bytes });
  }
  return results;
}

export interface ExportChartsDialogProps {
  open: boolean;
  onClose: () => void;
  getChartInstances: () => ECharts[];
  chartNames: string[];
}

export function ExportChartsDialog({
  open,
  onClose,
  getChartInstances,
  chartNames,
}: ExportChartsDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);

  const charts = getChartInstances();
  const count = Math.min(charts.length, chartNames.length);
  const canExport = count > 0;

  const exportToDirectory = async () => {
    if (!canExport || busy) return;
    const dir = await openDialog({
      directory: true,
      multiple: false,
    });
    if (dir == null) return;
    const dirPath = typeof dir === "string" ? dir : dir[0];
    if (!dirPath) return;

    setBusy(true);
    try {
      const images = await getChartImages(charts, chartNames, format, prefix.trim(), showMessage);
      if (!images) return;
      const base = dirPath.replace(/\/$/, "");
      for (const { name, bytes } of images) {
        await writeFile(`${base}/${name}`, bytes);
      }
      await showMessage(`Exported ${images.length} chart(s) to ${dirPath}`, {
        title: "Export complete",
        kind: "info",
      });
      onClose();
    } catch (e) {
      await showMessage(errorMessage(e), { title: "Export error", kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const exportToZip = async () => {
    if (!canExport || busy) return;
    const path = await saveDialog({
      filters: [{ name: "ZIP archive", extensions: ["zip"] }],
    });
    if (path == null) return;

    setBusy(true);
    try {
      const images = await getChartImages(charts, chartNames, format, prefix.trim(), showMessage);
      if (!images) return;
      const zip = new JSZip();
      for (const { name, bytes } of images) {
        zip.file(name, bytes);
      }
      const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
      await writeFile(path, new Uint8Array(arrayBuffer));
      await showMessage(`Exported ${images.length} chart(s) to ${path}`, {
        title: "Export complete",
        kind: "info",
      });
      onClose();
    } catch (e) {
      await showMessage(errorMessage(e), { title: "Export error", kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <dialog className="export-charts-dialog" open={open}>
      <div className="export-charts-dialog-content">
        <div className="export-charts-dialog-header">
          <h2>Export charts</h2>
          <button
            type="button"
            className="export-charts-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="export-charts-dialog-body">
          <div className="export-charts-dialog-field">
            <label htmlFor="export-format">Format</label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="export-charts-dialog-field">
            <label htmlFor="export-prefix">File prefix (optional)</label>
            <input
              id="export-prefix"
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g. run_2025-03-07"
              disabled={!canExport}
            />
            <span className="export-charts-dialog-hint">Applied to all exported filenames so they sort together.</span>
          </div>
          <p className="export-charts-dialog-count">
            {count} chart{count !== 1 ? "s" : ""} to export
          </p>
        </div>
        <div className="export-charts-dialog-actions">
          <button
            type="button"
            onClick={exportToDirectory}
            disabled={!canExport || busy}
          >
            Save to directory…
          </button>
          <button
            type="button"
            onClick={exportToZip}
            disabled={!canExport || busy}
          >
            Save as ZIP…
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
