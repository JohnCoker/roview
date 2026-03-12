import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RunFile } from "./RunFile";
import type { Theme } from "@fluentui/react-theme";
import { ColumnSelectDialog } from "./ColumnSelectDialog";
import { ChartGrid, type ChartGridRef } from "./ChartGrid";
import { ExportChartsDialog } from "./ExportChartsDialog";

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
  const [showExportDialog, setShowExportDialog] = useState(false);
  const chartGridRef = useRef<ChartGridRef>(null);
  const [columnDialogOpen, setColumnDialogOpen] = useState(false);

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
    return () => {
      unlistenFirst3.then((fn) => fn());
      unlistenAll.then((fn) => fn());
      unlistenSelect.then((fn) => fn());
    };
  }, [dataColumns, onSelectionChange]);

  return (
    <>
      <div className="chart-grid-scroll">
        <ChartGrid
          ref={chartGridRef}
          runFile={runFile}
          theme={theme}
          selectedColumnNames={selectedColumns}
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
        chartNames={selectedColumns}
      />
    </>
  );
}
