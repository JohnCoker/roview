import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RunFile } from "./RunFile";
import type { Theme } from "@fluentui/react-theme";
import { ColumnSelectDialog } from "./ColumnSelectDialog";
import { ChartGrid, type ChartGridRef } from "./ChartGrid";
import { ExportChartsDialog } from "./ExportChartsDialog";
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
}

export function LoadedFileView({
  runFile,
  theme,
  selectedColumns,
  onSelectionChange,
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
          const next = dataColumns.map((c) => c.name);
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

  return (
    <>
      <div className="chart-grid-scroll">
        <ChartGrid
          ref={chartGridRef}
          runFile={runFile}
          theme={theme}
          selectedColumnNames={selectedColumns}
          scrollTargetKey={scrollTargetKey}
        />
      </div>
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
