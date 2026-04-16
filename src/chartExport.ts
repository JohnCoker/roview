import * as echarts from "echarts";
import type { ECharts } from "echarts";
import "echarts-gl";
import { CARTESIAN_GRID_BOTTOM_NO_SLIDER, CHART_EXPORT_DATA_URL_OPTS, PLAYBACK_HIGHLIGHT_SERIES_ID } from "./util";

export type ExportFormat = "png" | "jpeg";

function sanitizeOptionForExport(opt: unknown): Record<string, unknown> {
  const o = (opt && typeof opt === "object" ? opt : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...o };

  // Ensure export renders in a single pass (no tween/progressive partial draws).
  next.animation = false;
  next.animationDuration = 0;
  next.animationDurationUpdate = 0;

  const rawDz = o.dataZoom;
  let removedSlider = false;
  if (Array.isArray(rawDz)) {
    const filtered = rawDz.filter((z) => !(z && typeof z === "object" && (z as { type?: string }).type === "slider"));
    removedSlider = filtered.length !== rawDz.length;
    // `inside` stays on the same xAxis and keeps the live start/end from getOption().
    next.dataZoom = filtered;
  }

  if (removedSlider) {
    const rawGrid = o.grid;
    if (rawGrid && typeof rawGrid === "object") {
      if (Array.isArray(rawGrid)) {
        next.grid = rawGrid.map((g) => {
          if (!g || typeof g !== "object") return g;
          const bottom = (g as { bottom?: number }).bottom;
          if (typeof bottom === "number" && bottom > CARTESIAN_GRID_BOTTOM_NO_SLIDER) {
            return { ...(g as Record<string, unknown>), bottom: CARTESIAN_GRID_BOTTOM_NO_SLIDER };
          }
          return g;
        });
      } else {
        const bottom = (rawGrid as { bottom?: number }).bottom;
        if (typeof bottom === "number" && bottom > CARTESIAN_GRID_BOTTOM_NO_SLIDER) {
          next.grid = { ...(rawGrid as Record<string, unknown>), bottom: CARTESIAN_GRID_BOTTOM_NO_SLIDER };
        }
      }
    }
  }

  const rawSeries = o.series;
  if (Array.isArray(rawSeries)) {
    next.series = rawSeries
      .filter((s) => !(s && typeof s === "object" && (s as { id?: string }).id === PLAYBACK_HIGHLIGHT_SERIES_ID))
      .map((s) => {
        if (!s || typeof s !== "object") return s;
        return {
          ...(s as Record<string, unknown>),
          animation: false,
          animationDuration: 0,
          animationDurationUpdate: 0,
          progressive: 0,
          progressiveThreshold: 0,
        };
      });
  }

  // Exports are “paper” artifacts; a fixed background is intentional.
  next.backgroundColor = CHART_EXPORT_DATA_URL_OPTS.backgroundColor;

  return next;
}

async function waitForFinishedOrFrame(chart: ECharts): Promise<void> {
  await new Promise<void>((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      chart.off("finished", onFinished as never);
      resolve();
    };
    const onFinished = () => cleanup();
    chart.on("finished", onFinished as never);

    requestAnimationFrame(() => {
      try {
        chart.getZr().flush();
      } catch {
        // ignore
      }
      requestAnimationFrame(cleanup);
    });
  });
}

/** `globe.baseTexture` / `heightTexture` load asynchronously; off-screen export often snapshots before WebGL uploads. */
function collectGlobeTextureUrls(option: Record<string, unknown>): string[] {
  const raw = option.globe;
  if (raw == null) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  const urls: string[] = [];
  for (const item of items) {
    if (item == null || typeof item !== "object") continue;
    const g = item as { baseTexture?: unknown; heightTexture?: unknown };
    if (typeof g.baseTexture === "string" && g.baseTexture) urls.push(g.baseTexture);
    if (typeof g.heightTexture === "string" && g.heightTexture) urls.push(g.heightTexture);
  }
  return [...new Set(urls)];
}

function preloadImages(urls: string[]): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}

/** Globe GL composites after texture upload; flush ZRender a few times so LayerGL can paint into the canvas. */
async function waitForGlobeExportPaint(chart: ECharts): Promise<void> {
  const zr = chart.getZr();
  for (let i = 0; i < 6; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      zr.flush();
    } catch {
      // ignore
    }
  }
  await waitForFinishedOrFrame(chart);
}

export async function getChartDataUrlForExport(sourceChart: ECharts, format: ExportFormat): Promise<string> {
  const w = Math.max(1, Math.floor(sourceChart.getWidth()));
  const h = Math.max(1, Math.floor(sourceChart.getHeight()));
  const option = sanitizeOptionForExport(sourceChart.getOption() as unknown);
  const globeTextureUrls = collectGlobeTextureUrls(option);
  if (globeTextureUrls.length > 0) {
    await preloadImages(globeTextureUrls);
  }

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-10000px";
  el.style.top = "0";
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  document.body.appendChild(el);

  const exportChart = echarts.init(el, undefined, { width: w, height: h, renderer: "canvas" });
  try {
    exportChart.setOption(option, { notMerge: true, lazyUpdate: false, silent: true } as never);
    await waitForFinishedOrFrame(exportChart);
    if (globeTextureUrls.length > 0) {
      await waitForGlobeExportPaint(exportChart);
    }
    return exportChart.getDataURL({ type: format, ...CHART_EXPORT_DATA_URL_OPTS });
  } finally {
    exportChart.dispose();
    el.remove();
  }
}
