import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import { save as saveDialog, message as showMessage } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Text, tokens, Toolbar, ToolbarButton, ToolbarGroup } from "@fluentui/react-components";
import { Add16Regular, Subtract16Regular } from "@fluentui/react-icons";
import type { Theme } from "@fluentui/react-theme";
import type { Col, RunFile } from "./RunFile";
import { ChartErrorBoundary } from "./ChartErrorBoundary";
import worldGeoJson from "./world.json";
import {
  formatVal,
  sanitizeFileName,
  dataUrlToBytes,
  errorMessage,
  EXPORT_EXT,
  EXPORT_FORMAT_LABEL,
  CHART_EXPORT_DATA_URL_OPTS,
  LAT_LONG_LINE_LABEL,
  LAT_LONG_LINE_SELECTION,
  MAP_TRACE_LABEL,
  MAP_TRACE_SELECTION,
  isLatLongLineSelection,
  isMapTraceSelection,
} from "./util";

export interface ChartGridProps {
  runFile: RunFile;
  theme: Theme;
  selectedColumnNames: string[];
  scrollTargetKey?: string | null;
}

export interface ChartGridRef {
  getChartInstances(): ECharts[];
}

type ReactEChartsRef = { getEchartsInstance: () => ECharts };
type LineChartSelection = { key: string; label: string; kind: "line"; col: Col };
type MapChartSelection = { key: string; label: string; kind: "map" };
type LatLongLineChartSelection = { key: string; label: string; kind: "latLong" };
type ChartSelection = LineChartSelection | MapChartSelection | LatLongLineChartSelection;

const WORLD_MAP_NAME = "roview-world";
const LINE_CHART_MIN_HEIGHT = 200;
const MAP_CHART_MIN_HEIGHT = 320;

function normalizeLongitudeDegrees(longitude: number): number {
  let normalized = longitude;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 20;

function readGeoZoom(chart: ECharts): number {
  const opt = chart.getOption() as unknown;
  // getOption() can be null/empty briefly after init (e.g. WebKit) before `geo` is merged in.
  if (opt == null || typeof opt !== "object") {
    return 1;
  }
  const geo = (opt as { geo?: Record<string, unknown> | Record<string, unknown>[] }).geo;
  const g = Array.isArray(geo) ? geo[0] : geo;
  const curRaw = g && typeof g === "object" && "zoom" in g ? Number((g as { zoom?: number }).zoom) : 1;
  const cur = Number.isFinite(curRaw) ? curRaw : 1;
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, cur));
}

/** Programmatic geo zoom; keeps pan (`roam: move`) while avoiding scroll-wheel zoom on the map. */
function adjustMapGeoZoom(chart: ECharts, factor: number): number {
  const cur = readGeoZoom(chart);
  const next = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, cur * factor));
  chart.setOption({ geo: { zoom: next } });
  return next;
}

if (echarts.getMap(WORLD_MAP_NAME) == null) {
  echarts.registerMap(WORLD_MAP_NAME, worldGeoJson as never);
}

export const ChartGrid = forwardRef<ChartGridRef, ChartGridProps>(
  function ChartGrid({ runFile, theme, selectedColumnNames, scrollTargetKey }, ref) {
  const chartRefs = useRef<ECharts[]>([]);
  const reactEChartsRefs = useRef<ReactEChartsRef[]>([]);
  const chartItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevSelectionRef = useRef<string[]>([]);
  const mapChartByKeyRef = useRef<Map<string, ECharts>>(new Map());
  const chartFontFamily = theme.fontFamilyBase;
  const chartText = theme.colorNeutralForeground1;
  const chartSubtleText = theme.colorNeutralForeground2;
  const chartAxis = theme.colorNeutralStrokeAccessible ?? theme.colorNeutralStroke1;
  const chartGridLine = theme.colorNeutralStroke2;
  const chartAccent = theme.colorBrandForeground1 ?? theme.colorBrandStroke1 ?? chartText;
  /** Axis line + tick stroke ~1.25px in chart space. */
  const chartAxisStrokePx = 1.25;
  /** Cartesian charts: balanced grid + ~one-letter tick–axis gap; H/V name gaps aligned. */
  /** Extra room for labels when margin increases (containLabel: false keeps multi-chart alignment). */
  const cartesianGrid = { left: 76, right: 12, top: 10, bottom: 40, containLabel: false } as const;
  const cartesianAxisNameGap = 26;
  /** ~1 letter / “space” between tick marks and scale numbers (reviewer). */
  const cartesianAxisLabelMargin = 11;
  const cartesianAxisLine = { lineStyle: { color: chartAxis, width: chartAxisStrokePx } };
  const cartesianAxisTick = { lineStyle: { color: chartAxis, width: chartAxisStrokePx } };
  const cartesianSplitLine = { show: true, lineStyle: { color: chartGridLine } };
  const cartesianTextStyle = {
    fontFamily: chartFontFamily,
    fontWeight: theme.fontWeightSemibold,
    color: chartText,
  };
  const cartesianAxisLabelBase = {
    margin: cartesianAxisLabelMargin,
    fontFamily: chartFontFamily,
    fontWeight: theme.fontWeightSemibold,
    color: chartSubtleText,
  };
  const cartesianNameTextStyle = {
    fontFamily: chartFontFamily,
    fontWeight: theme.fontWeightSemibold,
    color: chartSubtleText,
  };
  const menuBg = theme.colorNeutralBackground1;
  const menuBorder = theme.colorNeutralStroke1;
  const borderRadius = theme.borderRadiusMedium;
  const shadow = theme.shadow16;
  const tooltipBg = theme.colorNeutralBackground1;
  const tooltipBorder = theme.colorNeutralStroke1;
  const chartSelections: ChartSelection[] = selectedColumnNames.flatMap((name): ChartSelection[] => {
    if (isMapTraceSelection(name)) {
      return runFile.locationColumns() != null
        ? [{ key: MAP_TRACE_SELECTION, label: MAP_TRACE_LABEL, kind: "map" as const }]
        : [];
    }
    if (isLatLongLineSelection(name)) {
      return runFile.locationColumns() != null
        ? [{ key: LAT_LONG_LINE_SELECTION, label: LAT_LONG_LINE_LABEL, kind: "latLong" as const }]
        : [];
    }
    const col = runFile.getColumn(name);
    return col != null ? [{ key: col.name, label: col.name, kind: "line" as const, col }] : [];
  });
  const lineChartCount = chartSelections.filter((selection) => selection.kind === "line").length;

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

  /** Geo zoom per map chart (for +/- disabled at limits). */
  const [mapGeoZoom, setMapGeoZoom] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (scrollTargetKey == null) return;
    const chartEl = chartItemRefs.current[scrollTargetKey];
    if (!(chartEl instanceof HTMLElement)) return;
    const scrollContainer = chartEl.closest(".chart-grid-scroll");
    if (!(scrollContainer instanceof HTMLElement)) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const chartRect = chartEl.getBoundingClientRect();
    const above = chartRect.top < containerRect.top;
    const below = chartRect.bottom > containerRect.bottom;
    if (above || below) {
      chartEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [chartSelections, scrollTargetKey]);

  const timeCol = runFile.timeColumn();
  if (!timeCol || chartSelections.length === 0) {
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
    const chartName = chartSelections[chartIndex]?.label;
    if (!ref || !chartName) return;
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
    const defaultName = `${sanitizeFileName(chartName, "chart")}.${ext}`;
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

  const handleChartReady = (chart: ECharts, kind: "line" | "map" | "latLong", selectionKey: string) => {
    if (kind === "map") {
      mapChartByKeyRef.current.set(selectionKey, chart);
      setMapGeoZoom((prev) => ({ ...prev, [selectionKey]: readGeoZoom(chart) }));
    }
    if (kind !== "line") return;
    chartRefs.current.push(chart);
    if (lineChartCount > 1 && chartRefs.current.length === lineChartCount) {
      echarts.connect(chartRefs.current);
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
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: menuBg,
              border: `1px solid ${menuBorder}`,
              borderRadius,
              boxShadow: shadow,
              color: chartText,
              fontFamily: chartFontFamily,
            }}
            role="menu"
          >
            <button
            type="button"
            role="menuitem"
            style={{ background: "transparent", border: 0, color: "inherit", font: "inherit" }}
            onClick={() => exportSingleChart(contextMenu.chartIndex, "png")}
          >
            Export as PNG…
          </button>
          <button
            type="button"
            role="menuitem"
            style={{ background: "transparent", border: 0, color: "inherit", font: "inherit" }}
            onClick={() => exportSingleChart(contextMenu.chartIndex, "jpeg")}
          >
            Export as JPEG…
          </button>
          </div>
        </>
      )}
      {chartSelections.map((selection, index) => {
        const isMapChart = selection.kind === "map";
        const mapZoom = isMapChart ? (mapGeoZoom[selection.key] ?? 1) : 1;
        const option = (() => {
          if (selection.kind === "map") {
            const locationColumns = runFile.locationColumns();
            if (locationColumns == null) return null;
            const latValues = runFile.getColumnValues(locationColumns.lat.name);
            const longValues = runFile.getColumnValues(locationColumns.long.name);
            const points = latValues
              .map((lat, i) => {
                const long = longValues[i];
                const time = timeValues[i];
                if (lat == null || long == null) return null;
                return { value: [normalizeLongitudeDegrees(long), lat, time], rawLong: long };
              })
              .filter((point): point is { value: [number, number, number | null]; rawLong: number } => point != null);
            const latKind = locationColumns.lat.kind();
            const latUnit = locationColumns.lat.unit();
            const longKind = locationColumns.long.kind();
            const longUnit = locationColumns.long.unit();
            const mapFill = theme.colorNeutralBackground3 ?? theme.colorNeutralBackground2;
            const mapHighlight = theme.colorNeutralBackground4 ?? mapFill;

            return {
              textStyle: {
                fontFamily: chartFontFamily,
                fontWeight: theme.fontWeightSemibold,
                color: chartText,
              },
              tooltip: {
                trigger: "item" as const,
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderWidth: 1,
                padding: 8,
                textStyle: {
                  fontFamily: chartFontFamily,
                  fontWeight: theme.fontWeightSemibold,
                  color: chartText,
                },
                formatter: (params: any) => {
                  const value = Array.isArray(params?.value) ? params.value : [];
                  const rawLong = (params?.data?.rawLong ?? value[0]) as number | null | undefined;
                  const lat = value[1] as number | null | undefined;
                  const time = value[2] as number | null | undefined;

                  const timeLabel = `${timeCol.kind()}: ${formatVal(time)}${
                    timeCol.unit() ? ` ${timeCol.unit()}` : ""
                  }`;
                  const latLabel = `${latKind}: ${formatVal(lat)}${
                    latUnit ? ` ${latUnit}` : ""
                  }`;
                  const longLabel = `${longKind}: ${formatVal(rawLong)}${
                    longUnit ? ` ${longUnit}` : ""
                  }`;
                  return `${timeLabel}<br/>${latLabel}<br/>${longLabel}`;
                },
              },
              geo: {
                map: WORLD_MAP_NAME,
                left: 8,
                right: 8,
                top: 8,
                bottom: 8,
                roam: "move",
                zoom: mapZoom,
                scaleLimit: { min: MAP_ZOOM_MIN, max: MAP_ZOOM_MAX },
                itemStyle: { areaColor: mapFill, borderColor: chartAxis },
                emphasis: { itemStyle: { areaColor: mapHighlight } },
              },
              series: [
                {
                  type: "scatter" as const,
                  coordinateSystem: "geo" as const,
                  data: points,
                  symbolSize: 4,
                  z: 3,
                  itemStyle: { color: chartAccent, opacity: 1 },
                },
              ],
            };
          }
          if (selection.kind === "latLong") {
            const locationColumns = runFile.locationColumns();
            if (locationColumns == null) return null;
            const latValues = runFile.getColumnValues(locationColumns.lat.name);
            const longValues = runFile.getColumnValues(locationColumns.long.name);
            const data = latValues
              .map((lat, i) => {
                const long = longValues[i];
                const time = timeValues[i];
                if (lat == null || long == null) return null;
                return {
                  value: [long, lat] as [number, number],
                  rawLong: long,
                  time,
                };
              })
              .filter(
                (p): p is { value: [number, number]; rawLong: number; time: number | null } =>
                  p != null,
              );

            const timeKind = timeCol.kind();
            const timeUnit = timeCol.unit();
            const latKind = locationColumns.lat.kind();
            const latUnit = locationColumns.lat.unit();
            const longKind = locationColumns.long.kind();
            const longUnit = locationColumns.long.unit();

            return {
              textStyle: cartesianTextStyle,
              grid: { ...cartesianGrid },
              tooltip: {
                trigger: "axis" as const,
                axisPointer: { type: "line" as const },
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderWidth: 1,
                padding: 8,
                textStyle: cartesianTextStyle,
                formatter: (params: any) => {
                  const p = Array.isArray(params) ? params[0] : params;
                  const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
                  const longV = (p?.data?.rawLong ?? value[0]) as number | null | undefined;
                  const latV = value[1] as number | null | undefined;
                  const t = p?.data?.time as number | null | undefined;

                  const timeLabel = `${timeKind}: ${formatVal(t)}${timeUnit ? ` ${timeUnit}` : ""}`;
                  const longLabel = `${longKind}: ${formatVal(longV)}${longUnit ? ` ${longUnit}` : ""}`;
                  const latLabel = `${latKind}: ${formatVal(latV)}${latUnit ? ` ${latUnit}` : ""}`;
                  return `${timeLabel}<br/>${longLabel}<br/>${latLabel}`;
                },
              },
              xAxis: {
                type: "value" as const,
                name: locationColumns.long.name,
                nameLocation: "middle",
                nameGap: cartesianAxisNameGap,
                splitLine: cartesianSplitLine,
                axisLine: cartesianAxisLine,
                axisTick: cartesianAxisTick,
                axisLabel: {
                  ...cartesianAxisLabelBase,
                  formatter: formatAxisTick,
                  hideOverlap: true,
                },
                nameTextStyle: cartesianNameTextStyle,
              },
              yAxis: {
                type: "value" as const,
                name: locationColumns.lat.name,
                nameLocation: "middle",
                nameGap: cartesianAxisNameGap,
                nameRotate: 90,
                axisLine: cartesianAxisLine,
                axisTick: cartesianAxisTick,
                axisLabel: {
                  ...cartesianAxisLabelBase,
                  formatter: formatAxisTick,
                  hideOverlap: true,
                },
                nameTextStyle: cartesianNameTextStyle,
                splitLine: cartesianSplitLine,
              },
              dataZoom: [
                {
                  type: "inside" as const,
                  xAxisIndex: 0,
                  zoomOnMouseWheel: "ctrl" as const,
                  moveOnMouseWheel: false,
                  moveOnMouseMove: false,
                  zoomLock: true,
                },
              ],
              series: [
                {
                  type: "line" as const,
                  data,
                  symbol: "none" as const,
                  connectNulls: false,
                  lineStyle: { width: 2.5, color: chartAccent, cap: "round", join: "round" },
                  emphasis: {
                    lineStyle: { width: 2.5, color: chartAccent, cap: "round", join: "round" },
                  },
                },
              ],
            };
          }
          const col = selection.col;
          if (col == null) return null;
          const yValues = runFile.getColumnValues(col.name);
          const data: (number | null)[][] = timeValues
            .map((t, i) => (t != null ? [t, yValues[i] ?? null] : null))
            .filter((p): p is [number, number | null] => p != null);

          const timeKind = timeCol.kind();
          const timeUnit = timeCol.unit();
          const colKind = col.kind();
          const colUnit = col.unit();

          return {
            textStyle: cartesianTextStyle,
            grid: { ...cartesianGrid },
            tooltip: {
              trigger: "axis" as const,
              axisPointer: { type: "line" as const },
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              padding: 8,
              textStyle: cartesianTextStyle,
              formatter: (params: any) => {
                const p = Array.isArray(params) ? params[0] : params;
                const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
                const time = value[0] as number | null | undefined;
                const y = value[1] as number | null | undefined;

                const timeLabel = `${timeKind}: ${formatVal(time)}${
                  timeUnit ? ` ${timeUnit}` : ""
                }`;
                const colLabel = `${colKind}: ${formatVal(y)}${colUnit ? ` ${colUnit}` : ""}`;

                return `${timeLabel}<br/>${colLabel}`;
              },
            },
            xAxis: {
              type: "value" as const,
              name: timeCol.name,
              nameLocation: "middle",
              nameGap: cartesianAxisNameGap,
              splitLine: cartesianSplitLine,
              axisLine: cartesianAxisLine,
              axisTick: cartesianAxisTick,
              axisLabel: {
                ...cartesianAxisLabelBase,
                formatter: formatAxisTick,
                hideOverlap: true,
              },
              nameTextStyle: cartesianNameTextStyle,
            },
            yAxis: {
              type: "value" as const,
              name: col.name,
              nameLocation: "middle",
              nameGap: cartesianAxisNameGap,
              nameRotate: 90,
              axisLine: cartesianAxisLine,
              axisTick: cartesianAxisTick,
              axisLabel: {
                ...cartesianAxisLabelBase,
                formatter: formatAxisTick,
                hideOverlap: true,
              },
              nameTextStyle: cartesianNameTextStyle,
              splitLine: cartesianSplitLine,
            },
            dataZoom: [
              {
                type: "inside" as const,
                xAxisIndex: 0,
                zoomOnMouseWheel: "ctrl" as const,
                moveOnMouseWheel: false,
                moveOnMouseMove: false,
                zoomLock: true,
              },
            ],
            series: [
              {
                type: "line" as const,
                data,
                symbol: "none" as const,
                connectNulls: false,
                lineStyle: { width: 2.5, color: chartAccent, cap: "round", join: "round" },
                emphasis: {
                  lineStyle: { width: 2.5, color: chartAccent, cap: "round", join: "round" },
                },
              },
            ],
          };
        })();

        if (option == null) return null;

        const mapZoomInDisabled = isMapChart && mapZoom >= MAP_ZOOM_MAX - 1e-9;
        const mapZoomOutDisabled = isMapChart && mapZoom <= MAP_ZOOM_MIN + 1e-9;

        return (
          <div
            key={selection.key}
            className="chart-grid-item"
            ref={(el) => {
              chartItemRefs.current[selection.key] = el;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, chartIndex: index });
            }}
            style={isMapChart ? { position: "relative" } : undefined}
          >
            <ChartErrorBoundary chartLabel={selection.label} theme={theme}>
              {isMapChart && (
                <div
                  style={{
                    position: "absolute",
                    top: tokens.spacingVerticalM,
                    right: tokens.spacingHorizontalM,
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: tokens.spacingHorizontalS,
                    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
                    borderRadius: borderRadius,
                    border: `1px solid ${tokens.colorNeutralStrokeAlpha}`,
                    backgroundColor: `color-mix(in srgb, ${tokens.colorNeutralBackground2} 68%, transparent)`,
                    boxShadow: theme.shadow8,
                  }}
                >
                  <Text
                    size={200}
                    style={{
                      color: chartSubtleText,
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    Zoom
                  </Text>
                  <Toolbar
                    size="small"
                    aria-label="Map zoom"
                    style={{
                      backgroundColor: "transparent",
                      boxShadow: "none",
                      padding: 0,
                      minHeight: "auto",
                    }}
                  >
                    <ToolbarGroup>
                      <ToolbarButton
                        aria-label="Zoom in on map"
                        icon={<Add16Regular />}
                        disabled={mapZoomInDisabled}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          const next = adjustMapGeoZoom(c, 1.25);
                          setMapGeoZoom((prev) => ({ ...prev, [selection.key]: next }));
                        }}
                      />
                      <ToolbarButton
                        aria-label="Zoom out on map"
                        icon={<Subtract16Regular />}
                        disabled={mapZoomOutDisabled}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          const next = adjustMapGeoZoom(c, 1 / 1.25);
                          setMapGeoZoom((prev) => ({ ...prev, [selection.key]: next }));
                        }}
                      />
                    </ToolbarGroup>
                  </Toolbar>
                </div>
              )}
              <ReactEChartsCore
                echarts={echarts}
                ref={setReactEChartsRef}
                option={option}
                style={{
                  width: "100%",
                  height: isMapChart ? "clamp(300px, 56vw, 740px)" : "clamp(200px, 44vw, 520px)",
                  minHeight: isMapChart ? MAP_CHART_MIN_HEIGHT : LINE_CHART_MIN_HEIGHT,
                }}
                onChartReady={(chart) => handleChartReady(chart, selection.kind, selection.key)}
              />
            </ChartErrorBoundary>
          </div>
        );
      })}
    </div>
  );
});
