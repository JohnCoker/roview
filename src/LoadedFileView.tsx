import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RunFile } from "./RunFile";
import type { Theme } from "@fluentui/react-theme";
import { ColumnSelectDialog } from "./ColumnSelectDialog";
import { ChartGrid, type ChartGridRef } from "./ChartGrid";
import { ExportChartsDialog } from "./ExportChartsDialog";
import { MAP_TRACE_LABEL, MAP_TRACE_SELECTION, isMapTraceSelection } from "./util";

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
    return runFile.getColumn(name) != null ? [name] : [];
  });

  useEffect(() => {
    const unlisten = listen("menu-export-charts", () => {
      setShowExportDialog(true);
    });
    return () => {
      unlisten.then((fn) => fn());
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
    const enabled = locationColumns != null;
    invoke("set_map_trace_enabled", { enabled }).catch(() => {});
    return () => {
      invoke("set_map_trace_enabled", { enabled: false }).catch(() => {});
    };
  }, [locationColumns?.lat.name, locationColumns?.long.name]);

  useEffect(() => {
    if (!selectedColumns.includes(MAP_TRACE_SELECTION) && scrollTargetKey === MAP_TRACE_SELECTION) {
      setScrollTargetKey(null);
    }
  }, [scrollTargetKey, selectedColumns]);

  useEffect(() => {
    const unlistenFirst3 = listen("view-first-3-columns", () => {
      const next = dataColumns.slice(0, 3).map((c) => c.name);
      onSelectionChange(next);
    });
    const unlistenAll = listen("view-all-columns", () => {
      const next = dataColumns.map((c) => c.name);
      onSelectionChange(next);
    });
    const unlistenSelect = listen("view-select-columns", () => {
      setColumnDialogOpen(true);
    });
    const unlistenMapTrace = listen("view-map-trace", () => {
      if (locationColumns == null) return;
      if (selectedColumns.includes(MAP_TRACE_SELECTION)) {
        setScrollTargetKey(null);
        onSelectionChange(selectedColumns.filter((name) => name !== MAP_TRACE_SELECTION));
        return;
      }
      setScrollTargetKey(MAP_TRACE_SELECTION);
      onSelectionChange([...selectedColumns, MAP_TRACE_SELECTION]);
    });
    return () => {
      unlistenFirst3.then((fn) => fn());
      unlistenAll.then((fn) => fn());
      unlistenSelect.then((fn) => fn());
      unlistenMapTrace.then((fn) => fn());
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
