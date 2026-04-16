import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RunFile } from "./RunFile";
import type { Theme } from "@fluentui/react-theme";
import { ColumnSelectDialog } from "./ColumnSelectDialog";
import { ChartGrid, type ChartGridRef } from "./ChartGrid";
import { ExportChartsDialog } from "./ExportChartsDialog";
import { PlaybackBar } from "./PlaybackBar";
import {
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

export interface LoadedFileViewProps {
  runFile: RunFile;
  theme: Theme;
  selectedColumns: string[];
  onSelectionChange: (selected: string[]) => void;
  showZoomSlider?: boolean;
}

export function LoadedFileView({
  runFile,
  theme,
  selectedColumns,
  onSelectionChange,
  showZoomSlider,
}: LoadedFileViewProps) {
  /** Stable refs so the menu-listener effect does not re-run every render (was breaking Map Trace on macOS). */
  const dataColumns = useMemo(() => runFile.dataColumns(), [runFile]);
  const locationColumns = useMemo(() => runFile.locationColumns(), [runFile]);
  const globeColumns = useMemo(() => runFile.globeColumns(), [runFile]);
  /** Latest selection for menu handlers; keeping this off the listener effect deps avoids tearing down `listen()` on every column change. */
  const selectedColumnsRef = useRef(selectedColumns);
  selectedColumnsRef.current = selectedColumns;
  const [showExportDialog, setShowExportDialog] = useState(false);
  const chartGridRef = useRef<ChartGridRef>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [scrollTargetKey, setScrollTargetKey] = useState<string | null>(null);

  const timeCol = useMemo(() => runFile.timeColumn(), [runFile]);
  const timeMin = timeCol?.min ?? 0;
  const timeMax = timeCol?.max ?? 0;
  const [currentTime, setCurrentTime] = useState(timeMin);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  /** When false, charts omit the scrub highlight (exports match). Enter by Play, scrub, etc.; Stop exits. */
  const [playbackActive, setPlaybackActive] = useState(false);

  const playStateRef = useRef({ isPlaying, playbackSpeed, isLooping, timeMin, timeMax });
  playStateRef.current = { isPlaying, playbackSpeed, isLooping, timeMin, timeMax };

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastStateUpdateRef = useRef<number>(0);
  const STATE_UPDATE_INTERVAL_MS = 50;

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      setCurrentTime(currentTimeRef.current);
      return;
    }
    lastFrameRef.current = 0;
    lastStateUpdateRef.current = 0;
    const tick = (now: number) => {
      const st = playStateRef.current;
      if (!st.isPlaying) return;
      if (lastFrameRef.current > 0) {
        const deltaMs = Math.min(now - lastFrameRef.current, 100);
        const advance = (deltaMs / 1000) * st.playbackSpeed;
        let next = currentTimeRef.current + advance;
        if (next >= st.timeMax) {
          if (st.isLooping) {
            next = st.timeMin + (next - st.timeMax) % (st.timeMax - st.timeMin || 1);
          } else {
            next = st.timeMax;
            setIsPlaying(false);
          }
        }
        currentTimeRef.current = next;
        if (now - lastStateUpdateRef.current >= STATE_UPDATE_INTERVAL_MS) {
          setCurrentTime(next);
          lastStateUpdateRef.current = now;
        }
      }
      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    setCurrentTime(timeMin);
    setIsPlaying(false);
    setPlaybackActive(false);
  }, [runFile, timeMin]);

  const exitPlaybackMode = useCallback(() => {
    currentTimeRef.current = timeMin;
    setPlaybackActive(false);
    setIsPlaying(false);
    setIsLooping(false);
    setCurrentTime(timeMin);
  }, [timeMin]);

  const togglePlay = useCallback(() => {
    setPlaybackActive(true);
    setCurrentTime((t) => {
      if (t >= timeMax) return timeMin;
      return t;
    });
    setIsPlaying((p) => !p);
  }, [timeMin, timeMax]);
  const resetPlayback = useCallback(() => {
    setPlaybackActive(true);
    setIsPlaying(false);
    setCurrentTime(timeMin);
  }, [timeMin]);
  const toggleLoop = useCallback(() => {
    setPlaybackActive(true);
    setIsLooping((prev) => {
      if (!prev) setIsPlaying(true);
      return !prev;
    });
  }, []);
  const handleScrub = useCallback(
    (time: number) => {
      setPlaybackActive(true);
      setIsPlaying(false);
      setCurrentTime(time);
    },
    [],
  );

  const hasPlaybackBar = timeCol != null && selectedColumns.length > 0;
  useEffect(() => {
    if (!hasPlaybackBar) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      if (e.repeat) return;
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.closest("input, textarea, select, [contenteditable='true']")) return;
      if (el.closest('[role="dialog"]') || el.closest(".app-dialog-surface")) return;
      if (el.closest('[role="listbox"], [role="menu"], [role="menuitem"], [role="option"]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [hasPlaybackBar, togglePlay]);

  const chartNames = selectedColumns.flatMap((name) => {
    if (isMapTraceSelection(name)) return locationColumns != null ? [MAP_TRACE_LABEL] : [];
    if (isLatLongLineSelection(name)) return locationColumns != null ? [LAT_LONG_LINE_LABEL] : [];
    if (isGlobeTraceSelection(name)) return globeColumns != null ? [GLOBE_TRACE_LABEL] : [];
    return runFile.getColumn(name) != null ? [name] : [];
  });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen("menu-export-charts", () => {
        setShowExportDialog(true);
      });
      if (cancelled) unlisten();
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const enabled = selectedColumns.length > 0;
    invoke("set_export_charts_enabled", { enabled }).catch(() => {});
    return () => {
      invoke("set_export_charts_enabled", { enabled: false }).catch(() => {});
    };
  }, [selectedColumns.length]);

  useEffect(() => {
    if (!selectedColumns.includes(MAP_TRACE_SELECTION) && scrollTargetKey === MAP_TRACE_SELECTION) {
      setScrollTargetKey(null);
    }
    if (!selectedColumns.includes(LAT_LONG_LINE_SELECTION) && scrollTargetKey === LAT_LONG_LINE_SELECTION) {
      setScrollTargetKey(null);
    }
    if (!selectedColumns.includes(GLOBE_TRACE_SELECTION) && scrollTargetKey === GLOBE_TRACE_SELECTION) {
      setScrollTargetKey(null);
    }
  }, [scrollTargetKey, selectedColumns]);

  useEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];
    (async () => {
      const fns = await Promise.all([
        listen("view-first-4-columns", () => {
          const next = dataColumns.slice(0, 4).map((c) => c.name);
          onSelectionChange(next);
        }),
        listen("view-all-columns", () => {
          const base = dataColumns.map((c) => c.name);
          const next =
            locationColumns != null && !base.includes(LAT_LONG_LINE_SELECTION)
              ? [...base, LAT_LONG_LINE_SELECTION]
              : base;
          onSelectionChange(next);
        }),
        listen("view-select-columns", () => {
          setColumnDialogOpen(true);
        }),
        listen("view-map-trace", () => {
          if (locationColumns == null) return;
          const sel = selectedColumnsRef.current;
          if (sel.includes(MAP_TRACE_SELECTION)) {
            setScrollTargetKey(null);
            onSelectionChange(sel.filter((name) => name !== MAP_TRACE_SELECTION));
            return;
          }
          setScrollTargetKey(MAP_TRACE_SELECTION);
          onSelectionChange([...sel, MAP_TRACE_SELECTION]);
        }),
        listen("view-globe-trace", () => {
          if (globeColumns == null) return;
          const sel = selectedColumnsRef.current;
          if (sel.includes(GLOBE_TRACE_SELECTION)) {
            setScrollTargetKey(null);
            onSelectionChange(sel.filter((name) => name !== GLOBE_TRACE_SELECTION));
            return;
          }
          setScrollTargetKey(GLOBE_TRACE_SELECTION);
          onSelectionChange([...sel, GLOBE_TRACE_SELECTION]);
        }),
      ]);
      if (cancelled) {
        fns.forEach((u) => u());
        return;
      }
      unlisteners = fns;
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [dataColumns, locationColumns, globeColumns, onSelectionChange]);

  const hasCharts = selectedColumns.length > 0;

  return (
    <>
      <div className="chart-grid-scroll">
        <ChartGrid
          ref={chartGridRef}
          runFile={runFile}
          theme={theme}
          selectedColumnNames={selectedColumns}
          scrollTargetKey={scrollTargetKey}
          highlightTime={playbackActive ? currentTime : null}
          showZoomSlider={showZoomSlider}
        />
      </div>
      {hasCharts && timeCol != null && (
        <PlaybackBar
          timeMin={timeMin}
          timeMax={timeMax}
          currentTime={currentTime}
          playbackActive={playbackActive}
          isPlaying={isPlaying}
          speed={playbackSpeed}
          isLooping={isLooping}
          onTimeChange={handleScrub}
          onPlayPause={togglePlay}
          onReset={resetPlayback}
          onExitPlayback={exitPlaybackMode}
          onSpeedChange={setPlaybackSpeed}
          onLoopToggle={toggleLoop}
        />
      )}
      {columnDialogOpen && (
        <ColumnSelectDialog
          open
          onClose={() => setColumnDialogOpen(false)}
          runFile={runFile}
          selectedColumns={selectedColumns}
          onApply={onSelectionChange}
        />
      )}
      <ExportChartsDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getChartInstances={() => chartGridRef.current?.getChartInstances() ?? []}
        chartNames={chartNames}
      />
    </>
  );
}
