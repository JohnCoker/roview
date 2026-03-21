import { useEffect, useRef, useState } from "react";
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
  isLatLongLineSelection,
  isMapTraceSelection,
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
  const dataColumns = runFile.dataColumns();
  const locationColumns = runFile.locationColumns();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const chartGridRef = useRef<ChartGridRef>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [scrollTargetKey, setScrollTargetKey] = useState<string | null>(null);
  const chartNames = selectedColumns.flatMap((name) => {
    if (isMapTraceSelection(name)) return locationColumns != null ? [MAP_TRACE_LABEL] : [];
    if (isLatLongLineSelection(name)) return locationColumns != null ? [LAT_LONG_LINE_LABEL] : [];
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
  }, [scrollTargetKey, selectedColumns]);

  useEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];
    (async () => {
      const fns = await Promise.all([
        listen("view-first-3-columns", () => {
          const next = dataColumns.slice(0, 3).map((c) => c.name);
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
          if (selectedColumns.includes(MAP_TRACE_SELECTION)) {
            setScrollTargetKey(null);
            onSelectionChange(selectedColumns.filter((name) => name !== MAP_TRACE_SELECTION));
            return;
          }
          setScrollTargetKey(MAP_TRACE_SELECTION);
          onSelectionChange([...selectedColumns, MAP_TRACE_SELECTION]);
        }),
        listen("view-lat-long-line", () => {
          if (locationColumns == null) return;
          if (selectedColumns.includes(LAT_LONG_LINE_SELECTION)) {
            setScrollTargetKey(null);
            onSelectionChange(selectedColumns.filter((name) => name !== LAT_LONG_LINE_SELECTION));
            return;
          }
          setScrollTargetKey(LAT_LONG_LINE_SELECTION);
          onSelectionChange([...selectedColumns, LAT_LONG_LINE_SELECTION]);
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
  }, [dataColumns, locationColumns, onSelectionChange, selectedColumns]);

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
      <ColumnSelectDialog
        open={columnDialogOpen}
        onClose={() => setColumnDialogOpen(false)}
        dataColumns={dataColumns}
        selectedColumns={selectedColumns}
        onApply={onSelectionChange}
      />
      <ExportChartsDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getChartInstances={() => chartGridRef.current?.getChartInstances() ?? []}
        chartNames={chartNames}
      />
    </>
  );
}
