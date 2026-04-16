import {
  forwardRef,
  memo,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  type RefObject,
} from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import { save as saveDialog, message as showMessage } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Text, tokens, Toolbar, ToolbarButton, ToolbarGroup } from "@fluentui/react-components";
import { Add16Regular, Subtract16Regular, ZoomFit16Regular, MyLocation16Regular } from "@fluentui/react-icons";
import type { Theme } from "@fluentui/react-theme";
import type { Col, RunFile } from "./RunFile";
import { ChartErrorBoundary } from "./ChartErrorBoundary";
import worldGeoJson from "./world.json";
import "echarts-gl";
import { distanceToMeters } from "./converters";
import {
  formatVal,
  sanitizeFileName,
  dataUrlToBytes,
  errorMessage,
  EXPORT_EXT,
  EXPORT_FORMAT_LABEL,
  CARTESIAN_GRID_BOTTOM_NO_SLIDER,
  CARTESIAN_GRID_BOTTOM_WITH_SLIDER,
  PLAYBACK_HIGHLIGHT_SERIES_ID,
  LAT_LONG_LINE_LABEL,
  LAT_LONG_LINE_SELECTION,
  MAP_TRACE_LABEL,
  MAP_TRACE_SELECTION,
  GLOBE_TRACE_LABEL,
  GLOBE_TRACE_SELECTION,
  isLatLongLineSelection,
  isMapTraceSelection,
  isGlobeTraceSelection,
} from "./util";
import { getChartDataUrlForExport } from "./chartExport";

export interface ChartGridProps {
  runFile: RunFile;
  theme: Theme;
  selectedColumnNames: string[];
  scrollTargetKey?: string | null;
  highlightTime?: number | null;
  showZoomSlider?: boolean;
}

export interface ChartGridRef {
  getChartInstances(): ECharts[];
}

type ReactEChartsRef = { getEchartsInstance: () => ECharts };
type LineChartSelection = { key: string; label: string; kind: "line"; col: Col };
type MapChartSelection = { key: string; label: string; kind: "map" };
type LatLongLineChartSelection = { key: string; label: string; kind: "latLong" };
type GlobeChartSelection = { key: string; label: string; kind: "globe" };
type ChartSelection = LineChartSelection | MapChartSelection | LatLongLineChartSelection | GlobeChartSelection;

const WORLD_MAP_NAME = "roview-world";
/** Geo `lines` polyline (stable paint); dense `scatter` “lines” glitch on hover in ECharts 5 + geo. */
const MAP_TRACE_LINE_SERIES_ID = "map-trace-line";
/** Globe `lines3D` polyline — same rationale as map: continuous stroke + shared line styling with Cartesian charts. */
const GLOBE_TRACE_LINE_SERIES_ID = "globe-trace-line";
/**
 * Invisible `scatter3D` used only for (1) globe altitude-axis extent — echarts-gl does not read `alt` from `lines3D`
 * coords when building `globeModel.coordinateSystem.altitudeAxis` — and (2) hover tooltips (`lines3D` mesh ignores picking).
 * Slight radial bump keeps pick hits in front of the line in the depth buffer.
 */
const GLOBE_TRACE_PICK_SERIES_ID = "globe-trace-pick";
const GLOBE_TRACE_PICK_ALT_BUMP = 0.12;
const LINE_CHART_MIN_HEIGHT = 200;
const MAP_CHART_MIN_HEIGHT = 320;
const GLOBE_RADIUS = 100;
/**
 * Mean Earth radius for globe radial scaling, aligned with RASOrbit exports:
 * average of equatorial and polar radii in feet, then ft→m using the same
 * factor as `distanceToMeters` for `ft` in {@link ./converters}.
 */
const EARTH_MEAN_RADIUS_FT_RASORBIT = 20890663;
const EARTH_RADIUS_M = EARTH_MEAN_RADIUS_FT_RASORBIT * 0.3048;

function findNearestByTime<T>(data: T[], getTime: (item: T) => number | null | undefined, target: number): T | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const item of data) {
    const t = getTime(item);
    if (t == null) continue;
    const d = Math.abs(t - target);
    if (d < bestDist) { bestDist = d; best = item; }
  }
  return best;
}

function playbackHighlightData<T>(
  highlightTime: number | null | undefined,
  data: T[],
  getTime: (item: T) => number | null | undefined,
  toSeriesData: (best: T) => unknown[],
): unknown[] {
  if (highlightTime == null) return [];
  const best = findNearestByTime(data, getTime, highlightTime);
  return best != null ? toSeriesData(best) : [];
}

function normalizeLongitudeDegrees(longitude: number): number {
  let normalized = longitude;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

/**
 * Split the ground track into contiguous polylines in normalized lon (−180…180).
 * When |Δlon| > 180° between successive samples, ECharts would draw a chord across the map;
 * starting a new segment keeps coordinates inside geo’s range so the full trace stays visible.
 * `pointChunkIndex[i]` is the `lines` `data` index for sample `i` (for `showTip` / tooltips).
 */
function splitMapTracePolylineOnLongitudeWrap(points: MapTracePoint[]): {
  chunks: { coords: [number, number][]; times: (number | null)[]; rawLongs: number[] }[];
  pointChunkIndex: number[];
} {
  if (points.length === 0) return { chunks: [], pointChunkIndex: [] };

  const pointChunkIndex: number[] = new Array(points.length);
  const chunks: { coords: [number, number][]; times: (number | null)[]; rawLongs: number[] }[] = [];
  let coords: [number, number][] = [[points[0].value[0], points[0].value[1]]];
  let times: (number | null)[] = [points[0].time];
  let rawLongs: number[] = [points[0].rawLong];
  let chunkId = 0;
  pointChunkIndex[0] = 0;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const lon = pt.value[0];
    const lat = pt.value[1];
    const prevLon = coords[coords.length - 1][0];

    if (Math.abs(lon - prevLon) > 180) {
      chunks.push({ coords, times, rawLongs });
      chunkId++;
      coords = [[lon, lat]];
      times = [pt.time];
      rawLongs = [pt.rawLong];
    } else {
      coords.push([lon, lat]);
      times.push(pt.time);
      rawLongs.push(pt.rawLong);
    }
    pointChunkIndex[i] = chunkId;
  }
  chunks.push({ coords, times, rawLongs });

  for (const ch of chunks) {
    if (ch.coords.length === 1) {
      ch.coords.push([ch.coords[0][0], ch.coords[0][1]]);
    }
  }
  return { chunks, pointChunkIndex };
}

function formatMapTraceTooltipHtml(
  pt: MapTracePoint,
  timeCol: Col,
  latKind: string,
  latUnit: string,
  longKind: string,
  longUnit: string,
): string {
  const time = pt.time;
  const lat = pt.value[1];
  const rawLong = pt.rawLong;
  const timeLabel = `${timeCol.kind()}: ${formatVal(time)}${timeCol.unit() ? ` ${timeCol.unit()}` : ""}`;
  const latLabel = `${latKind}: ${formatVal(lat)}${latUnit ? ` ${latUnit}` : ""}`;
  const longLabel = `${longKind}: ${formatVal(rawLong)}${longUnit ? ` ${longUnit}` : ""}`;
  return `${timeLabel}<br/>${latLabel}<br/>${longLabel}`;
}

type MapTraceBuiltBundle = {
  option: Record<string, unknown>;
  points: MapTracePoint[];
  pointChunkIndex: number[];
};

/**
 * ECharts 5 geo `lines` + `polyline` does not expose which vertex is hovered, so the stock
 * tooltip formatter cannot show the right row. We pick the nearest data sample in lon/lat
 * and refresh the tooltip — small, localized glue (not general chart magic).
 * Programmatic `showTip` + `dataIndex` would snap the tooltip to the polyline; `tooltip.position`
 * reads the latest ZRender pointer so the box stays with the cursor.
 */
function attachMapTraceTooltipInteraction(
  chart: ECharts,
  builtRef: RefObject<MapTraceBuiltBundle | null>,
  sampleRef: RefObject<MapTracePoint | null>,
  mouseRef: RefObject<{ x: number; y: number }>,
): void {
  const zr = chart.getZr();
  let tipRaf = 0;
  let pendingDataIndex: number | null = null;
  const flushShowTip = () => {
    tipRaf = 0;
    if (pendingDataIndex == null) return;
    const dataIndex = pendingDataIndex;
    pendingDataIndex = null;
    chart.dispatchAction({
      type: "showTip",
      seriesIndex: 0,
      dataIndex,
    } as never);
  };
  const scheduleShowTip = (dataIndex: number) => {
    pendingDataIndex = dataIndex;
    if (tipRaf !== 0) return;
    tipRaf = requestAnimationFrame(flushShowTip);
  };
  const onMove = (ev: { offsetX: number; offsetY: number }) => {
    const m = mouseRef.current;
    m.x = ev.offsetX;
    m.y = ev.offsetY;
    const built = builtRef.current;
    if (built == null) return;
    const { points: pts, pointChunkIndex: pci } = built;
    if (pts.length === 0 || pci.length !== pts.length) return;
    let geo: number[] | null = null;
    try {
      let r = chart.convertFromPixel({ geoIndex: 0 }, [ev.offsetX, ev.offsetY]);
      if (!Array.isArray(r) || r.length < 2) {
        r = chart.convertFromPixel({ seriesIndex: 0 }, [ev.offsetX, ev.offsetY]);
      }
      geo = Array.isArray(r) ? (r as number[]) : null;
    } catch {
      try {
        const r = chart.convertFromPixel({ seriesIndex: 0 }, [ev.offsetX, ev.offsetY]);
        geo = Array.isArray(r) ? (r as number[]) : null;
      } catch {
        return;
      }
    }
    if (!geo || geo.length < 2) return;
    const gx = geo[0];
    const gy = geo[1];
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].value[0] - gx;
      const dy = pts[i].value[1] - gy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (Math.sqrt(bestD) > 5) {
      sampleRef.current = null;
      pendingDataIndex = null;
      if (tipRaf !== 0) {
        cancelAnimationFrame(tipRaf);
        tipRaf = 0;
      }
      chart.dispatchAction({ type: "hideTip" });
      return;
    }
    sampleRef.current = pts[bestI];
    scheduleShowTip(pci[bestI]);
  };
  const onGlobalOut = () => {
    sampleRef.current = null;
    pendingDataIndex = null;
    if (tipRaf !== 0) {
      cancelAnimationFrame(tipRaf);
      tipRaf = 0;
    }
    chart.dispatchAction({ type: "hideTip" });
  };
  zr.on("mousemove", onMove);
  zr.on("globalout", onGlobalOut);
  chart.on("disposed", () => {
    zr.off("mousemove", onMove);
    zr.off("globalout", onGlobalOut);
    if (tipRaf !== 0) {
      cancelAnimationFrame(tipRaf);
      tipRaf = 0;
    }
  });
}

type GlobeTracePoint = {
  value: [number, number, number];
  rawLong: number;
  rawLat: number;
  rawAlt: number | null;
  time: number | null;
};

/**
 * One continuous `lines3D` polyline for the globe.
 *
 * Unlike {@link splitMapTracePolylineOnLongitudeWrap} (2D geo), we do **not** split into
 * multiple `lines3D` data items at ±180°: each item is its own polyline, so the segment that
 * actually crosses the antimeridian is never drawn and a gap appears at 180°E/W.
 *
 * Unwrap longitude step by step (add/subtract 360°) so each hop is within 180° of the previous
 * sample; e.g. 179° then −179° becomes 179° then 181°. The globe
 * `dataToPoint` mapping is periodic in longitude, so 3D positions stay correct while the
 * polyline stays connected.
 *
 * (Map trace still uses chunk splitting because 2D geo must keep lon in [-180, 180] and avoid
 * drawing a chord across the flat map.)
 */
function buildGlobeTracePolylineChunks(points: GlobeTracePoint[]): {
  chunks: {
    coords: [number, number, number][];
    times: (number | null)[];
    rawLongs: number[];
    rawLats: number[];
    rawAlts: (number | null)[];
  }[];
} {
  if (points.length === 0) return { chunks: [] };

  const coords: [number, number, number][] = [];
  const times: (number | null)[] = [];
  const rawLongs: number[] = [];
  const rawLats: number[] = [];
  const rawAlts: (number | null)[] = [];

  let prevUnwrappedLon: number | null = null;
  for (const pt of points) {
    let lon = pt.value[0];
    const lat = pt.value[1];
    const h = pt.value[2];
    if (prevUnwrappedLon != null) {
      while (lon - prevUnwrappedLon > 180) lon -= 360;
      while (lon - prevUnwrappedLon < -180) lon += 360;
    }
    prevUnwrappedLon = lon;
    coords.push([lon, lat, h]);
    times.push(pt.time);
    rawLongs.push(pt.rawLong);
    rawLats.push(pt.rawLat);
    rawAlts.push(pt.rawAlt);
  }

  if (coords.length === 1) {
    const c = coords[0];
    coords.push([c[0], c[1], c[2]]);
    times.push(times[0]);
    rawLongs.push(rawLongs[0]);
    rawLats.push(rawLats[0]);
    rawAlts.push(rawAlts[0]);
  }

  return { chunks: [{ coords, times, rawLongs, rawLats, rawAlts }] };
}

type GlobeTraceBuiltBundle = {
  points: GlobeTracePoint[];
  chunks: {
    coords: [number, number, number][];
    times: (number | null)[];
    rawLongs: number[];
    rawLats: number[];
    rawAlts: (number | null)[];
  }[];
  maxGlobeAlt: number;
  centerLat: number;
  centerLong: number;
  globeHighlightAltBump: number;
  globeCols: NonNullable<ReturnType<RunFile["globeColumns"]>>;
};

function buildGlobeTracePoints(runFile: RunFile, timeValues: (number | null)[]): GlobeTracePoint[] | null {
  const globeCols = runFile.globeColumns();
  if (globeCols == null) return null;
  const altToMeters = distanceToMeters(globeCols.alt);
  const latValues = runFile.getColumnValues(globeCols.lat.name);
  const longValues = runFile.getColumnValues(globeCols.long.name);
  const altValues = runFile.getColumnValues(globeCols.alt.name);
  const metersToGlobe = GLOBE_RADIUS / EARTH_RADIUS_M;
  const globePoints: GlobeTracePoint[] = [];
  for (let i = 0; i < latValues.length; i++) {
    const lat = latValues[i];
    const long = longValues[i];
    const rawAlt = altValues[i];
    const altM = altToMeters ? altToMeters(rawAlt) : rawAlt;
    if (lat == null || long == null || altM == null) continue;
    const globeAlt = altM * metersToGlobe;
    const normLong = normalizeLongitudeDegrees(long);
    globePoints.push({
      value: [normLong, lat, globeAlt],
      rawLong: long,
      rawLat: lat,
      rawAlt: rawAlt,
      time: timeValues[i] ?? null,
    });
  }
  return globePoints;
}

const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 20;
const GLOBE_DIST_DEFAULT = 200;
const GLOBE_DIST_MIN = 101;
const GLOBE_DIST_MAX = 500;
/** Minimum outward nudge (globe coords) so the playback dot stays in front of the trace in WebGL depth tests. */
const GLOBE_PLAYBACK_HIGHLIGHT_ALT_BUMP_MIN = 0.35;

/** No tween on highlight updates (2D/geo; avoids lag). Globe also relies on this — see globe option `animation`. */
const PLAYBACK_HIGHLIGHT_ANIMATION = {
  animation: false,
  animationDuration: 0,
  animationDurationUpdate: 0,
} as const;

type MapTracePoint = { value: [number, number]; time: number | null; rawLong: number };

function buildMapTraceScatterPoints(
  runFile: RunFile,
  timeValues: (number | null)[],
): MapTracePoint[] | null {
  const locationColumns = runFile.locationColumns();
  if (locationColumns == null) return null;
  const latValues = runFile.getColumnValues(locationColumns.lat.name);
  const longValues = runFile.getColumnValues(locationColumns.long.name);
  const points: MapTracePoint[] = [];
  for (let i = 0; i < latValues.length; i++) {
    const lat = latValues[i];
    const long = longValues[i];
    const time = timeValues[i];
    if (lat == null || long == null) continue;
    points.push({
      value: [normalizeLongitudeDegrees(long), lat],
      time,
      rawLong: long,
    });
  }
  return points;
}

/** Base map option only: React/`echarts-for-react` should not merge full option on every `highlightTime` tick (geo+canvas repaint bugs). */
function buildMapTraceBaseEchartsOption(params: {
  chunks: { coords: [number, number][]; times: (number | null)[]; rawLongs: number[] }[];
  mapTooltipFormatter: (tooltipParams: unknown) => string;
  mapZoom: number;
  theme: Theme;
  highlightColor: string;
  chartFontFamily: string;
  chartText: string;
  chartAxis: string;
  lineSeriesLineStyle: { width: number; color: string; cap: "round"; join: "round" };
  mapTooltipMouseRef: RefObject<{ x: number; y: number }>;
  tooltipBg: string;
  tooltipBorder: string;
  mapFill: string;
  mapHighlight: string;
}): Record<string, unknown> {
  const {
    chunks,
    mapTooltipFormatter,
    mapZoom,
    chartFontFamily,
    chartText,
    chartAxis,
    lineSeriesLineStyle,
    mapTooltipMouseRef,
    tooltipBg,
    tooltipBorder,
    mapFill,
    mapHighlight,
    highlightColor,
  } = params;

  return {
    animation: false,
    textStyle: {
      fontFamily: chartFontFamily,
      fontWeight: params.theme.fontWeightSemibold,
      color: chartText,
    },
    tooltip: {
      trigger: "item" as const,
      transitionDuration: 0,
      confine: true,
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      padding: 8,
      textStyle: {
        fontFamily: chartFontFamily,
        fontWeight: params.theme.fontWeightSemibold,
        color: chartText,
      },
      formatter: mapTooltipFormatter,
      /** `showTip` + `dataIndex` would snap the box to the polyline; keep it under the cursor instead. */
      position: (
        _point: number[],
        _tooltipParams?: unknown,
        _dom?: unknown,
        _rect?: unknown,
        size?: { viewSize?: [number, number]; contentSize?: [number, number] },
      ) => {
        const { x, y } = mapTooltipMouseRef.current;
        const padX = 14;
        const padY = 14;
        const vw = size?.viewSize?.[0];
        const vh = size?.viewSize?.[1];
        const cw = size?.contentSize?.[0];
        const ch = size?.contentSize?.[1];
        let px = x + padX;
        let py = y + padY;
        if (vw != null && cw != null && px + cw > vw) px = Math.max(0, x - cw - padX);
        if (vh != null && ch != null && py + ch > vh) py = Math.max(0, y - ch - padY);
        return [px, py] as [number, number];
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
      ...((): Record<string, unknown>[] => {
        if (chunks.length === 0) return [];
        return [
          {
            id: MAP_TRACE_LINE_SERIES_ID,
            type: "lines" as const,
            coordinateSystem: "geo" as const,
            polyline: true,
            z: 3,
            silent: false,
            lineStyle: { ...lineSeriesLineStyle, opacity: 1 },
            emphasis: {
              lineStyle: { ...lineSeriesLineStyle, opacity: 1 },
            },
            animation: false,
            animationDurationUpdate: 0,
            data: chunks.map((ch) => ({
              coords: ch.coords,
              times: ch.times,
              rawLongs: ch.rawLongs,
            })),
          },
        ];
      })(),
      {
        id: PLAYBACK_HIGHLIGHT_SERIES_ID,
        type: "scatter" as const,
        coordinateSystem: "geo" as const,
        ...PLAYBACK_HIGHLIGHT_ANIMATION,
        data: [] as unknown[],
        symbolSize: 12,
        z: 4,
        itemStyle: { color: highlightColor, opacity: 1 },
        silent: true,
        tooltip: { show: false },
      },
    ],
  };
}

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

function readGlobeDistance(chart: ECharts): number {
  const opt = chart.getOption() as unknown;
  if (opt == null || typeof opt !== "object") return GLOBE_DIST_DEFAULT;
  const globe = (opt as { globe?: Record<string, unknown> | Record<string, unknown>[] }).globe;
  const g = Array.isArray(globe) ? globe[0] : globe;
  if (g == null || typeof g !== "object") return GLOBE_DIST_DEFAULT;
  const vc = (g as { viewControl?: Record<string, unknown> }).viewControl;
  const raw = vc && typeof vc === "object" && "distance" in vc ? Number((vc as { distance?: number }).distance) : GLOBE_DIST_DEFAULT;
  const cur = Number.isFinite(raw) ? raw : GLOBE_DIST_DEFAULT;
  return Math.min(GLOBE_DIST_MAX, Math.max(GLOBE_DIST_MIN, cur));
}

function adjustGlobeDistance(chart: ECharts, factor: number): number {
  const cur = readGlobeDistance(chart);
  const next = Math.min(GLOBE_DIST_MAX, Math.max(GLOBE_DIST_MIN, cur * factor));
  chart.setOption({ globe: { viewControl: { distance: next } } });
  return next;
}

if (echarts.getMap(WORLD_MAP_NAME) == null) {
  echarts.registerMap(WORLD_MAP_NAME, worldGeoJson as never);
}

export const ChartGrid = memo(forwardRef<ChartGridRef, ChartGridProps>(
  function ChartGrid({ runFile, theme, selectedColumnNames, scrollTargetKey, highlightTime, showZoomSlider }, ref) {
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
  /** Same Fluent stroke for Cartesian `line` series and Map Trace `lines` (width / caps match). */
  const cartesianLineSeriesLineStyle = {
    width: 2.5,
    color: chartAccent,
    cap: "round" as const,
    join: "round" as const,
  };
  /** Axis line + tick stroke ~1.25px in chart space. */
  const chartAxisStrokePx = 1.25;
  /** Cartesian charts: balanced grid + ~one-letter tick–axis gap; H/V name gaps aligned. */
  /** Extra room for labels when margin increases (containLabel: false keeps multi-chart alignment). */
  const cartesianGrid = {
    left: 76,
    right: 12,
    top: 10,
    bottom: showZoomSlider ? CARTESIAN_GRID_BOTTOM_WITH_SLIDER : CARTESIAN_GRID_BOTTOM_NO_SLIDER,
    containLabel: false,
  } as const;
  const cartesianXAxisNameGap = 34;
  const cartesianYAxisNameGap = 62;
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

  const buildCartesianValueAxis = (params: { axis: "x" | "y"; name: string }) => {
    const base = {
      type: "value" as const,
      name: params.name,
      nameLocation: "middle" as const,
      splitLine: cartesianSplitLine,
      axisLine: cartesianAxisLine,
      axisTick: cartesianAxisTick,
      axisLabel: {
        ...cartesianAxisLabelBase,
        formatter: formatAxisTick,
        hideOverlap: true,
      },
      nameTextStyle: cartesianNameTextStyle,
    };
    if (params.axis === "x") {
      return {
        ...base,
        nameGap: cartesianXAxisNameGap,
      };
    }
    return {
      ...base,
      nameGap: cartesianYAxisNameGap,
      nameRotate: 90,
    };
  };

  const buildCartesianOption = (params: {
    xAxis: Record<string, unknown>;
    yAxis: Record<string, unknown>;
    tooltipFormatter: (params: unknown) => string;
    series: Record<string, unknown>[];
  }): Record<string, unknown> => {
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
        formatter: params.tooltipFormatter as never,
      },
      xAxis: params.xAxis,
      yAxis: params.yAxis,
      dataZoom: [
        {
          type: "inside" as const,
          xAxisIndex: 0,
          zoomOnMouseWheel: "ctrl" as const,
          moveOnMouseWheel: false,
          moveOnMouseMove: false,
          zoomLock: true,
        },
        {
          type: "slider" as const,
          xAxisIndex: 0,
          show: showZoomSlider,
          height: 18,
          bottom: 0,
          showDetail: false,
          showDataShadow: false,
          brushSelect: false,
        },
      ],
      series: params.series,
    };
  };
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
    if (isGlobeTraceSelection(name)) {
      return runFile.globeColumns() != null
        ? [{ key: GLOBE_TRACE_SELECTION, label: GLOBE_TRACE_LABEL, kind: "globe" as const }]
        : [];
    }
    const col = runFile.getColumn(name);
    return col != null ? [{ key: col.name, label: col.name, kind: "line" as const, col }] : [];
  });
  const lineChartCount = chartSelections.filter((selection) => selection.kind === "line").length;

  const formatAxisTick = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "";
    const abs = Math.abs(v);
    if (abs === 0) return "0";
    const toFixedHalfUp = (n: number, digits: number) => {
      // Bias away from binary-float ties so `.5` cases round "half up" more predictably.
      // We keep this local (axis ticks only) to avoid changing general numeric formatting.
      let neg = false;
      let x = n;
      if (x < 0) {
        neg = true;
        x = Math.abs(x);
      }
      x += 1 / Math.pow(10, digits + 2);
      let s = x.toFixed(digits);
      if (neg) s = `−${s}`;
      return s;
    };
    // Keep labels narrow so a fixed grid.left can stay aligned across charts.
    if (abs >= 1_000_000) return `${toFixedHalfUp(v / 1_000_000, abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${toFixedHalfUp(v / 1_000, abs >= 10_000 ? 0 : 1)}k`;
    if (abs >= 10) return toFixedHalfUp(v, 0);
    if (abs >= 1) return toFixedHalfUp(v, 1);
    // Small magnitudes: show more decimals to avoid flattening the axis (e.g. 0.001–0.003).
    // Target ~2 significant digits, clamped to a max of 4 decimals for label compactness.
    const log10 = Math.floor(Math.log10(abs));
    const decimals = Math.max(0, Math.min(4, 2 - log10 - 1));
    const s = toFixedHalfUp(v, decimals);
    return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  };

  const highlightColor = theme.colorPaletteRedForeground1;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    chartIndex: number;
  } | null>(null);

  /** Geo zoom per map chart (for +/- disabled at limits). */
  const [mapGeoZoom, setMapGeoZoom] = useState<Record<string, number>>({});
  /** Globe camera distance per globe chart (for +/- disabled at limits). */
  const [globeDist, setGlobeDist] = useState<Record<string, number>>({});

  /** Capture-phase wheel handler for globe charts: forward scroll to the page instead of echarts-gl. */
  const globeWheelRefs = useRef<Map<string, { el: HTMLDivElement; handler: (e: WheelEvent) => void }>>(new Map());
  const attachGlobeWheelCapture = (key: string, el: HTMLDivElement | null) => {
    const prev = globeWheelRefs.current.get(key);
    if (prev?.el === el) return;
    if (prev) {
      prev.el.removeEventListener("wheel", prev.handler, true);
      globeWheelRefs.current.delete(key);
    }
    if (el == null) return;
    const handler = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const scrollContainer = el.closest(".chart-grid-scroll");
      if (scrollContainer) scrollContainer.scrollTop += e.deltaY;
    };
    el.addEventListener("wheel", handler, { capture: true, passive: false });
    globeWheelRefs.current.set(key, { el, handler });
  };

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

  const scrolledForKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (scrollTargetKey == null) {
      scrolledForKeyRef.current = null;
      return;
    }
    if (scrolledForKeyRef.current === scrollTargetKey) return;
    const chartEl = chartItemRefs.current[scrollTargetKey];
    if (!(chartEl instanceof HTMLElement)) return;
    const scrollContainer = chartEl.closest(".chart-grid-scroll");
    if (!(scrollContainer instanceof HTMLElement)) return;

    scrolledForKeyRef.current = scrollTargetKey;
    const containerRect = scrollContainer.getBoundingClientRect();
    const chartRect = chartEl.getBoundingClientRect();
    const above = chartRect.top < containerRect.top;
    const below = chartRect.bottom > containerRect.bottom;
    if (above || below) {
      chartEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [chartSelections, scrollTargetKey]);

  const timeCol = runFile.timeColumn();

  // Reset collected instances when the set of charts changes
  const selectionChanged =
    prevSelectionRef.current.length !== selectedColumnNames.length ||
    prevSelectionRef.current.some((n, i) => n !== selectedColumnNames[i]);
  if (selectionChanged) {
    prevSelectionRef.current = [...selectedColumnNames];
    chartRefs.current = [];
    reactEChartsRefs.current = [];
  }

  const timeValues = timeCol ? runFile.getColumnValues(timeCol.name) as (number | null)[] : [];

  const mapTraceSelected = selectedColumnNames.includes(MAP_TRACE_SELECTION);
  const mapTraceZoom = mapGeoZoom[MAP_TRACE_SELECTION] ?? 1;

  /** Nearest ground-track sample for Map Trace tooltip (ECharts `lines` polyline item params lack a reliable vertex index). */
  const mapTraceTooltipSampleRef = useRef<MapTracePoint | null>(null);
  /** Pointer in ZRender space; drives `tooltip.position` so the box tracks the cursor instead of the polyline vertex. */
  const mapTraceTooltipMouseRef = useRef({ x: 0, y: 0 });

  const globeTraceSelected = selectedColumnNames.includes(GLOBE_TRACE_SELECTION);

  const globeTraceBuilt = useMemo((): GlobeTraceBuiltBundle | null => {
    if (!globeTraceSelected || timeCol == null) return null;
    const points = buildGlobeTracePoints(runFile, timeValues);
    if (points == null || points.length === 0) return null;
    const { chunks } = buildGlobeTracePolylineChunks(points);
    if (chunks.length === 0) return null;
    let maxGlobeAlt = 0;
    let latSum = 0;
    let longSum = 0;
    for (const p of points) {
      if (p.value[2] > maxGlobeAlt) maxGlobeAlt = p.value[2];
      latSum += p.value[1];
      longSum += p.value[0];
    }
    const n = points.length;
    const centerLat = n > 0 ? latSum / n : 0;
    const centerLong = n > 0 ? longSum / n : 0;
    const globeHighlightAltBump = Math.max(GLOBE_PLAYBACK_HIGHLIGHT_ALT_BUMP_MIN, maxGlobeAlt * 0.04);
    const globeCols = runFile.globeColumns();
    if (globeCols == null) return null;
    return {
      points,
      chunks,
      maxGlobeAlt,
      centerLat,
      centerLong,
      globeHighlightAltBump,
      globeCols,
    };
  }, [globeTraceSelected, timeCol, runFile, timeValues]);

  const mapTraceBuilt = useMemo(() => {
    if (!mapTraceSelected || timeCol == null) return null;
    const points = buildMapTraceScatterPoints(runFile, timeValues);
    if (points == null) return null;
    const lc = runFile.locationColumns();
    if (lc == null) return null;
    const latKind = lc.lat.kind();
    const latUnit = lc.lat.unit() ?? "";
    const longKind = lc.long.kind();
    const longUnit = lc.long.unit() ?? "";
    const { chunks, pointChunkIndex } = splitMapTracePolylineOnLongitudeWrap(points);
    if (chunks.length === 0) return null;

    const mapTooltipFormatter = (tooltipParams: unknown) => {
      const p = tooltipParams as { seriesType?: string };
      if (p.seriesType !== "lines") return "";
      const pt = mapTraceTooltipSampleRef.current;
      if (!pt) return "";
      return formatMapTraceTooltipHtml(pt, timeCol, latKind, latUnit, longKind, longUnit);
    };

    const mapFill = theme.colorNeutralBackground3 ?? theme.colorNeutralBackground2;
    const mapHighlight = theme.colorNeutralBackground4 ?? mapFill;
    const option = buildMapTraceBaseEchartsOption({
      chunks,
      mapTooltipFormatter,
      mapZoom: mapTraceZoom,
      theme,
      highlightColor,
      chartFontFamily: theme.fontFamilyBase,
      chartText: theme.colorNeutralForeground1,
      chartAxis: theme.colorNeutralStrokeAccessible ?? theme.colorNeutralStroke1,
      lineSeriesLineStyle: cartesianLineSeriesLineStyle,
      mapTooltipMouseRef: mapTraceTooltipMouseRef,
      tooltipBg: theme.colorNeutralBackground1,
      tooltipBorder: theme.colorNeutralStroke1,
      mapFill,
      mapHighlight,
    });
    return { option, points, pointChunkIndex };
  }, [mapTraceSelected, timeCol, runFile, timeValues, mapTraceZoom, theme, highlightColor]);

  const mapTraceBuiltRef = useRef<MapTraceBuiltBundle | null>(null);
  mapTraceBuiltRef.current = mapTraceBuilt;
  const highlightTimeRef = useRef(highlightTime);
  highlightTimeRef.current = highlightTime;
  const highlightColorRef = useRef(highlightColor);
  highlightColorRef.current = highlightColor;

  const syncMapPlaybackHighlight = () => {
    const built = mapTraceBuiltRef.current;
    if (built == null) return;
    const chart = mapChartByKeyRef.current.get(MAP_TRACE_SELECTION);
    if (chart == null) return;
    const data = playbackHighlightData(
      highlightTimeRef.current,
      built.points,
      (p) => p.time,
      (p) => [{ value: [p.value[0], p.value[1]] }],
    );
    chart.setOption(
      {
        series: [
          {
            id: PLAYBACK_HIGHLIGHT_SERIES_ID,
            type: "scatter" as const,
            coordinateSystem: "geo" as const,
            ...PLAYBACK_HIGHLIGHT_ANIMATION,
            data,
            symbolSize: 12,
            z: 4,
            itemStyle: { color: highlightColorRef.current, opacity: 1 },
            silent: true,
            tooltip: { show: false },
          },
        ],
      },
      { silent: true },
    );
  };

  useLayoutEffect(() => {
    if (!mapTraceSelected) return;
    syncMapPlaybackHighlight();
  }, [mapTraceSelected, highlightTime, highlightColor, mapTraceBuilt]);

  useEffect(() => {
    if (!mapTraceSelected) mapTraceTooltipSampleRef.current = null;
  }, [mapTraceSelected]);

  useImperativeHandle(ref, () => ({
    getChartInstances() {
      return reactEChartsRefs.current
        .map((r) => r.getEchartsInstance())
        .filter((inst): inst is ECharts => inst != null);
    },
  }));

  /** Hiding the slider should show the full X range again (slider was the main zoom affordance). */
  const prevShowZoomSliderRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const prev = prevShowZoomSliderRef.current;
    prevShowZoomSliderRef.current = showZoomSlider;
    if (prev !== true || showZoomSlider !== false) return;
    if (!timeCol || chartSelections.length === 0) return;

    queueMicrotask(() => {
      for (let i = 0; i < reactEChartsRefs.current.length && i < chartSelections.length; i++) {
        const kind = chartSelections[i]?.kind;
        if (kind !== "line" && kind !== "latLong") continue;
        const inst = reactEChartsRefs.current[i]?.getEchartsInstance();
        if (!inst) continue;
        inst.dispatchAction({
          type: "dataZoom",
          xAxisIndex: 0,
          start: 0,
          end: 100,
        } as never);
      }
    });
  }, [showZoomSlider, timeCol, chartSelections]);

  if (!timeCol || chartSelections.length === 0) {
    return (
      <p className="chart-grid-empty">Select columns above to add charts.</p>
    );
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
      dataUrl = await getChartDataUrlForExport(chart, format);
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

  const handleChartReady = (chart: ECharts, kind: "line" | "map" | "latLong" | "globe", selectionKey: string) => {
    if (kind === "map") {
      mapChartByKeyRef.current.set(selectionKey, chart);
      setMapGeoZoom((prev) => ({ ...prev, [selectionKey]: readGeoZoom(chart) }));
      attachMapTraceTooltipInteraction(chart, mapTraceBuiltRef, mapTraceTooltipSampleRef, mapTraceTooltipMouseRef);
      queueMicrotask(() => {
        syncMapPlaybackHighlight();
      });
    }
    if (kind === "globe") {
      mapChartByKeyRef.current.set(selectionKey, chart);
      setGlobeDist((prev) => ({ ...prev, [selectionKey]: readGlobeDistance(chart) }));
    }
    if (kind !== "line") return;
    chartRefs.current.push(chart);
    if (lineChartCount > 1 && chartRefs.current.length === lineChartCount) {
      echarts.connect(chartRefs.current);
    }
  };

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
        const isGlobeChart = selection.kind === "globe";
        const isSpatialChart = isMapChart || isGlobeChart;
        const mapZoom = isMapChart ? (mapGeoZoom[selection.key] ?? 1) : 1;
        const option = (() => {
          if (selection.kind === "map") {
            return mapTraceBuilt != null ? (mapTraceBuilt.option as object) : null;
          }
          if (selection.kind === "globe") {
            if (globeTraceBuilt == null) return null;
            const {
              points: globePoints,
              chunks,
              maxGlobeAlt,
              centerLat,
              centerLong,
              globeHighlightAltBump,
              globeCols,
            } = globeTraceBuilt;
            const latKind = globeCols.lat.kind();
            const latUnit = globeCols.lat.unit();
            const longKind = globeCols.long.kind();
            const longUnit = globeCols.long.unit();
            const altKind = globeCols.alt.kind();
            const altUnit = globeCols.alt.unit();

            return {
              // Globe-only: keep chart + highlight updates non-animated (see `PLAYBACK_HIGHLIGHT_ANIMATION`).
              animation: false,
              backgroundColor: theme.colorNeutralBackground2,
              textStyle: {
                fontFamily: chartFontFamily,
                fontWeight: theme.fontWeightSemibold,
                color: chartText,
              },
              tooltip: {
                trigger: "item" as const,
                transitionDuration: 0,
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderWidth: 1,
                padding: 8,
                textStyle: {
                  fontFamily: chartFontFamily,
                  fontWeight: theme.fontWeightSemibold,
                  color: chartText,
                },
                formatter: (params: unknown) => {
                  const p = params as {
                    data?: { rawLong?: number; rawLat?: number; rawAlt?: number | null; time?: number | null };
                  };
                  const d = p.data;
                  if (d == null || typeof d.rawLong !== "number") return "";
                  const timeLabel = `${timeCol.kind()}: ${formatVal(d.time ?? null)}${
                    timeCol.unit() ? ` ${timeCol.unit()}` : ""
                  }`;
                  const latLabel = `${latKind}: ${formatVal(d.rawLat ?? null)}${
                    latUnit ? ` ${latUnit}` : ""
                  }`;
                  const longLabel = `${longKind}: ${formatVal(d.rawLong ?? null)}${
                    longUnit ? ` ${longUnit}` : ""
                  }`;
                  const altLabel = `${altKind}: ${formatVal(d.rawAlt ?? null)}${
                    altUnit ? ` ${altUnit}` : ""
                  }`;
                  return `${timeLabel}<br/>${latLabel}<br/>${longLabel}<br/>${altLabel}`;
                },
              },
              globe: {
                globeRadius: GLOBE_RADIUS,
                globeOuterRadius: GLOBE_RADIUS + maxGlobeAlt,
                baseTexture: "/world-surface.jpg",
                heightTexture: "/world-height.jpg",
                shading: "lambert" as const,
                atmosphere: { show: false },
                viewControl: (() => {
                  const base = { autoRotate: false, zoomSensitivity: 0, distance: globeDist[selection.key] ?? GLOBE_DIST_DEFAULT };
                  const existing = mapChartByKeyRef.current.get(selection.key);
                  if (existing) {
                    const opt = existing.getOption() as Record<string, unknown>;
                    const g = Array.isArray(opt?.globe) ? (opt.globe as Record<string, unknown>[])[0] : opt?.globe as Record<string, unknown> | undefined;
                    const vc = g?.viewControl as { alpha?: number; beta?: number } | undefined;
                    if (vc && typeof vc.alpha === "number" && typeof vc.beta === "number") {
                      return { ...base, alpha: vc.alpha, beta: vc.beta };
                    }
                  }
                  return { ...base, alpha: centerLat, beta: centerLong + 90 };
                })(),
                light: {
                  ambient: { intensity: 1 },
                  main: { intensity: 0 },
                },
              },
                           series: [
                {
                  id: GLOBE_TRACE_LINE_SERIES_ID,
                  type: "lines3D" as const,
                  coordinateSystem: "globe" as const,
                  polyline: true,
                  zlevel: -10,
                  silent: true,
                  blendMode: "source-over" as const,
                  lineStyle: { ...cartesianLineSeriesLineStyle, opacity: 1 },
                  animation: false,
                  animationDurationUpdate: 0,
                  tooltip: { show: false },
                  data: chunks.map((ch) => ({ coords: ch.coords })),
                },
                {
                  id: GLOBE_TRACE_PICK_SERIES_ID,
                  type: "scatter3D" as const,
                  coordinateSystem: "globe" as const,
                  zlevel: 5,
                  symbolSize: 6,
                  label: { show: false },
                  emphasis: {
                    label: { show: false },
                    itemStyle: { opacity: 0 },
                  },
                  itemStyle: {
                    color: chartAccent,
                    opacity: 0,
                  },
                  silent: false,
                  animation: false,
                  animationDurationUpdate: 0,
                  data: globePoints.map((p) => ({
                    value: [p.value[0], p.value[1], p.value[2] + GLOBE_TRACE_PICK_ALT_BUMP] as [number, number, number],
                    rawLong: p.rawLong,
                    rawLat: p.rawLat,
                    rawAlt: p.rawAlt,
                    time: p.time,
                  })),
                },
                {
                  id: PLAYBACK_HIGHLIGHT_SERIES_ID,
                  type: "scatter3D" as const,
                  coordinateSystem: "globe" as const,
                  ...PLAYBACK_HIGHLIGHT_ANIMATION,
                  symbolSize: 10,
                  label: { show: false },
                  emphasis: { label: { show: false } },
                  itemStyle: { color: highlightColor, opacity: 1 },
                  silent: true,
                  tooltip: { show: false },
                  data: playbackHighlightData(
                    highlightTime,
                    globePoints,
                    (p) => p.time,
                    (p) => {
                      const [lng, lat, h] = p.value;
                      return [{ value: [lng, lat, h + globeHighlightAltBump] as [number, number, number] }];
                    },
                  ),
                  zlevel: 10,
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

            return buildCartesianOption({
              xAxis: buildCartesianValueAxis({ axis: "x", name: locationColumns.long.name }),
              yAxis: buildCartesianValueAxis({ axis: "y", name: locationColumns.lat.name }),
              tooltipFormatter: (params: unknown) => {
                const p = Array.isArray(params) ? (params as any[])[0] : (params as any);
                const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
                const longV = (p?.data?.rawLong ?? value[0]) as number | null | undefined;
                const latV = value[1] as number | null | undefined;
                const t = p?.data?.time as number | null | undefined;

                const timeLabel = `${timeKind}: ${formatVal(t)}${timeUnit ? ` ${timeUnit}` : ""}`;
                const longLabel = `${longKind}: ${formatVal(longV)}${longUnit ? ` ${longUnit}` : ""}`;
                const latLabel = `${latKind}: ${formatVal(latV)}${latUnit ? ` ${latUnit}` : ""}`;
                return `${timeLabel}<br/>${longLabel}<br/>${latLabel}`;
              },
              series: [
                {
                  type: "line" as const,
                  data,
                  symbol: "none" as const,
                  connectNulls: false,
                  sampling: "lttb" as const,
                  lineStyle: cartesianLineSeriesLineStyle,
                  emphasis: {
                    lineStyle: cartesianLineSeriesLineStyle,
                  },
                },
                {
                  id: PLAYBACK_HIGHLIGHT_SERIES_ID,
                  type: "scatter" as const,
                  ...PLAYBACK_HIGHLIGHT_ANIMATION,
                  data: playbackHighlightData(highlightTime, data, (d) => d.time, (d) => [{ value: d.value }]),
                  symbolSize: 10,
                  z: 4,
                  itemStyle: { color: highlightColor, opacity: 1 },
                  silent: true,
                  tooltip: { show: false },
                },
              ],
            });
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

          return buildCartesianOption({
            xAxis: buildCartesianValueAxis({ axis: "x", name: timeCol.name }),
            yAxis: buildCartesianValueAxis({ axis: "y", name: col.name }),
            tooltipFormatter: (params: unknown) => {
              const p = Array.isArray(params) ? (params as any[])[0] : (params as any);
              const value = Array.isArray(p?.value) ? p.value : [p?.value, null];
              const time = value[0] as number | null | undefined;
              const y = value[1] as number | null | undefined;

              const timeLabel = `${timeKind}: ${formatVal(time)}${timeUnit ? ` ${timeUnit}` : ""}`;
              const colLabel = `${colKind}: ${formatVal(y)}${colUnit ? ` ${colUnit}` : ""}`;
              return `${timeLabel}<br/>${colLabel}`;
            },
            series: [
              {
                type: "line" as const,
                data,
                symbol: "none" as const,
                connectNulls: false,
                sampling: "lttb" as const,
                lineStyle: cartesianLineSeriesLineStyle,
                emphasis: {
                  lineStyle: cartesianLineSeriesLineStyle,
                },
              },
              {
                id: PLAYBACK_HIGHLIGHT_SERIES_ID,
                type: "scatter" as const,
                ...PLAYBACK_HIGHLIGHT_ANIMATION,
                data: playbackHighlightData(highlightTime, data, (d) => d[0], (row) => [row]),
                symbolSize: 10,
                z: 4,
                itemStyle: { color: highlightColor, opacity: 1 },
                silent: true,
                tooltip: { show: false },
              },
            ],
          });
        })();

        if (option == null) return null;

        const mapZoomInDisabled = isMapChart && mapZoom >= MAP_ZOOM_MAX - 1e-9;
        const mapZoomOutDisabled = isMapChart && mapZoom <= MAP_ZOOM_MIN + 1e-9;
        const curGlobeDist = isGlobeChart ? (globeDist[selection.key] ?? GLOBE_DIST_DEFAULT) : GLOBE_DIST_DEFAULT;
        const globeZoomInDisabled = isGlobeChart && curGlobeDist <= GLOBE_DIST_MIN + 1e-9;
        const globeZoomOutDisabled = isGlobeChart && curGlobeDist >= GLOBE_DIST_MAX - 1e-9;

        return (
          <div
            key={selection.key}
            className="chart-grid-item"
            ref={(el) => {
              chartItemRefs.current[selection.key] = el;
              if (isGlobeChart) attachGlobeWheelCapture(selection.key, el);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, chartIndex: index });
            }}
            style={{
              boxSizing: "border-box",
              border: `1px solid ${theme.colorNeutralStroke2}`,
              borderRadius: theme.borderRadiusMedium,
              ...(isSpatialChart ? { position: "relative" } : undefined),
              ...(isGlobeChart ? { backgroundColor: theme.colorNeutralBackground2 } : undefined),
              ...(!isSpatialChart
                ? {
                    paddingTop: "0.5em",
                    paddingRight: "0.5em",
                    paddingBottom: "1em",
                    paddingLeft: "1em",
                  }
                : undefined),
            }}
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
                      <ToolbarButton
                        aria-label="Reset map view"
                        icon={<ZoomFit16Regular />}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          c.dispatchAction({ type: "restore" });
                          setMapGeoZoom((prev) => ({ ...prev, [selection.key]: 1 }));
                        }}
                      />
                    </ToolbarGroup>
                  </Toolbar>
                </div>
              )}
              {isGlobeChart && (
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
                    aria-label="Globe zoom"
                    style={{
                      backgroundColor: "transparent",
                      boxShadow: "none",
                      padding: 0,
                      minHeight: "auto",
                    }}
                  >
                    <ToolbarGroup>
                      <ToolbarButton
                        aria-label="Zoom in on globe"
                        icon={<Add16Regular />}
                        disabled={globeZoomInDisabled}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          const next = adjustGlobeDistance(c, 1 / 1.25);
                          setGlobeDist((prev) => ({ ...prev, [selection.key]: next }));
                        }}
                      />
                      <ToolbarButton
                        aria-label="Zoom out on globe"
                        icon={<Subtract16Regular />}
                        disabled={globeZoomOutDisabled}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          const next = adjustGlobeDistance(c, 1.25);
                          setGlobeDist((prev) => ({ ...prev, [selection.key]: next }));
                        }}
                      />
                      <ToolbarButton
                        aria-label="Reset globe view"
                        icon={<MyLocation16Regular />}
                        onClick={() => {
                          const c = mapChartByKeyRef.current.get(selection.key);
                          if (!c) return;
                          c.dispatchAction({ type: "restore" });
                          setGlobeDist((prev) => ({ ...prev, [selection.key]: GLOBE_DIST_DEFAULT }));
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
                  height: isGlobeChart
                    ? "min(100vh, 100vw)"
                    : isMapChart
                      ? "clamp(300px, 56vw, 740px)"
                      : "clamp(200px, 44vw, 520px)",
                  minHeight: isMapChart ? MAP_CHART_MIN_HEIGHT : isGlobeChart ? undefined : LINE_CHART_MIN_HEIGHT,
                }}
                onChartReady={(chart) => handleChartReady(chart, selection.kind, selection.key)}
              />
            </ChartErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}));
