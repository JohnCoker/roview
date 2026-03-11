import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { connect } from "echarts";
import type { ECharts } from "echarts";
import { save as saveDialog, message as showMessage } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { RunFile } from "./RunFile";
import {
  formatVal,
  sanitizeFileName,
  dataUrlToBytes,
  errorMessage,
  EXPORT_EXT,
  EXPORT_FORMAT_LABEL,
  CHART_EXPORT_DATA_URL_OPTS,
} from "./util";

export interface ChartGridProps {
  runFile: RunFile;
  selectedColumnNames: string[];
}

export interface ChartGridRef {
  getChartInstances(): ECharts[];
}

type ReactEChartsRef = { getEchartsInstance: () => ECharts };

export const ChartGrid = forwardRef<ChartGridRef, ChartGridProps>(
  function ChartGrid({ runFile, selectedColumnNames }, ref) {
  const chartRefs = useRef<ECharts[]>([]);
  const reactEChartsRefs = useRef<ReactEChartsRef[]>([]);
  const prevSelectionRef = useRef<string[]>([]);

  const formatAxisTick = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "";
    const abs = Math.abs(v);
    // Keep labels narrow so a fixed grid.left can stay aligned across charts.
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
    if (abs >= 10) return v.toFixed(0);
    if (abs >= 1) return v.toFixed(1);
    return v.toFixed(2);
  };

  useImperativeHandle(ref, () => ({
    getChartInstances() {
      return reactEChartsRefs.current
        .map((r) => r.getEchartsInstance())
        .filter((inst): inst is ECharts => inst != null);
    },
  }));

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    chartIndex: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!document.querySelector(".chart-context-menu")?.contains(target)) close();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [contextMenu]);

  const timeCol = runFile.timeColumn();
  if (!timeCol || selectedColumnNames.length === 0) {
    return (
      <p className="chart-grid-empty">Select columns above to add charts.</p>
    );
  }

  // Reset collected instances when the set of charts changes
  const selectionChanged =
    prevSelectionRef.current.length !== selectedColumnNames.length ||
    prevSelectionRef.current.some((n, i) => n !== selectedColumnNames[i]);
  if (selectionChanged) {
    prevSelectionRef.current = [...selectedColumnNames];
    chartRefs.current = [];
    reactEChartsRefs.current = [];
  }

  const setReactEChartsRef = (el: ReactEChartsRef | null) => {
    if (el) {
      reactEChartsRefs.current.push(el);
    }
  };

  const exportSingleChart = async (chartIndex: number, format: "png" | "jpeg") => {
    setContextMenu(null);
    const ref = reactEChartsRefs.current[chartIndex];
    const colName = selectedColumnNames[chartIndex];
    if (!ref || !colName) return;
    const chart = ref.getEchartsInstance();
    if (!chart) return;
    let dataUrl: string;
    try {
      dataUrl = chart.getDataURL({ type: format, ...CHART_EXPORT_DATA_URL_OPTS });
    } catch (e) {
      await showMessage(errorMessage(e), { title: "Export error", kind: "error" });
      return;
    }
    if (dataUrl == null || typeof dataUrl !== "string") {
      await showMessage("Chart returned no image data.", { title: "Export error", kind: "error" });
      return;
    }
    const ext = EXPORT_EXT[format];
    const defaultName = `${sanitizeFileName(colName, "chart")}.${ext}`;
    const path = await saveDialog({
      filters: [{ name: EXPORT_FORMAT_LABEL[format], extensions: [ext] }],
      defaultPath: defaultName,
    });
    if (path == null) return;
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) {
      await showMessage("Could not decode chart image.", { title: "Export error", kind: "error" });
      return;
    }
    try {
      await writeFile(path, bytes);
      await showMessage("Chart exported.", { title: "Export complete", kind: "info" });
    } catch (e) {
      await showMessage(errorMessage(e), { title: "Export error", kind: "error" });
    }
  };

  const handleChartReady = (chart: ECharts) => {
    chartRefs.current.push(chart);
    if (chartRefs.current.length === selectedColumnNames.length) {
      connect(chartRefs.current);
    }
  };

  const timeValues = runFile.getColumnValues(timeCol.name) as (number | null)[];

  return (
    <div className="chart-grid" key={selectedColumnNames.join(",")}>
      {contextMenu != null && (
        <>
          <div
            className="chart-context-menu-overlay"
            aria-hidden
            onClick={() => setContextMenu(null)}
          />
          <div
            className="chart-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            <button
            type="button"
            role="menuitem"
            onClick={() => exportSingleChart(contextMenu.chartIndex, "png")}
          >
            Export as PNG…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => exportSingleChart(contextMenu.chartIndex, "jpeg")}
          >
            Export as JPEG…
          </button>
          </div>
        </>
      )}
      {selectedColumnNames.map((colName, index) => {
        const col = runFile.getColumn(colName);
        if (!col) return null;
        const yValues = runFile.getColumnValues(col.name);
        const data: (number | null)[][] = timeValues
          .map((t, i) => (t != null ? [t, yValues[i] ?? null] : null))
          .filter((p): p is [number, number | null] => p != null);

        const timeKind = timeCol.kind();
        const timeUnit = timeCol.unit();
        const colKind = col.kind();
        const colUnit = col.unit();

        const option = {
          // Use a fixed left margin so all Y axes align visually across charts.
          grid: { left: 68, right: 10, top: 8, bottom: 30, containLabel: false },
          tooltip: {
            trigger: "axis" as const,
            axisPointer: { type: "line" as const },
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
              const time = value[0] as number | null | undefined;
              const y = value[1] as number | null | undefined;

              const timeLabel = `${timeKind}: ${formatVal(time)}${
                timeUnit ? ` ${timeUnit}` : ""
              }`;
              const colLabel = `${colKind}: ${formatVal(y)}${
                colUnit ? ` ${colUnit}` : ""
              }`;

              return `${timeLabel}<br/>${colLabel}`;
            },
          },
          xAxis: {
            type: "value" as const,
            name: timeCol.name,
            nameLocation: "middle",
            nameGap: 22,
            splitLine: { show: false },
          },
          yAxis: {
            type: "value" as const,
            name: col.name,
            nameLocation: "middle",
            nameGap: 34,
            nameRotate: 90,
            axisLabel: { margin: 4, formatter: formatAxisTick, hideOverlap: true },
            splitLine: { show: true, lineStyle: { opacity: 0.3 } },
          },
          dataZoom: [
            {
              type: "inside",
              xAxisIndex: 0,
              zoomOnMouseWheel: "ctrl",
              moveOnMouseWheel: false,
              moveOnMouseMove: false,
              zoomLock: true,
            },
          ],
          series: [
            {
              type: "line" as const,
              data,
              symbol: "none",
              connectNulls: false,
              lineStyle: { width: 2.5, color: "#111", cap: "round", join: "round" },
            },
          ],
        };

        return (
          <div
            key={col.name}
            className="chart-grid-item"
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, chartIndex: index });
            }}
          >
            <ReactECharts
              ref={setReactEChartsRef}
              option={option}
              style={{ width: "100%", aspectRatio: "3/2", minHeight: 200 }}
              onChartReady={handleChartReady}
            />
          </div>
        );
      })}
    </div>
  );
});
