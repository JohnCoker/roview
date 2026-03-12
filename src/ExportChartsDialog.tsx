import { useState } from "react";
import { open as openDialog, save as saveDialog, message as showMessage } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";
import type { ECharts } from "echarts";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Input,
  Label,
  Option,
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
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
  const formatLabel = FORMATS.find((f) => f.value === format)?.label ?? format.toUpperCase();

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

  return (
    <Dialog
      open={open}
      onOpenChange={(_e, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className="app-dialog-surface" style={{ maxWidth: 420 }}>
        <DialogBody>
          <DialogTitle
            action={
              <DialogTrigger action="close" disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  aria-label="Close"
                  icon={<Dismiss24Regular />}
                  size="small"
                />
              </DialogTrigger>
            }
          >
            Export charts
          </DialogTitle>
          <DialogContent>
            <p style={{ margin: 0, marginBottom: "0.75rem", fontSize: "0.9rem", opacity: 0.9 }}>
              {count} chart{count !== 1 ? "s" : ""} to export
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "1rem" }}>
              <Label id="export-format-label">Format</Label>
              <Dropdown
                aria-labelledby="export-format-label"
                value={formatLabel}
                selectedOptions={[format]}
                disabled={!canExport || busy}
                onOptionSelect={(_e, data) => {
                  const next = data.optionValue as ExportFormat | undefined;
                  if (next === "png" || next === "jpeg") setFormat(next);
                }}
              >
                {FORMATS.map((f) => (
                  <Option key={f.value} value={f.value}>
                    {f.label}
                  </Option>
                ))}
              </Dropdown>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "1rem" }}>
              <Label htmlFor="export-prefix">File prefix (optional)</Label>
              <Input
                id="export-prefix"
                value={prefix}
                onChange={(_e, data) => setPrefix(data.value)}
                placeholder="e.g. run_2025-03-07"
                disabled={!canExport}
              />
              <span style={{ fontSize: "0.85rem" }}>
                Applied to all exported filenames so they sort together.
              </span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={exportToDirectory}
              disabled={!canExport || busy}
            >
              Save…
            </Button>
            <Button
              onClick={exportToZip}
              disabled={!canExport || busy}
            >
              Save ZIP…
            </Button>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
