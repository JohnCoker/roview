import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RunFile, Problem } from "./RunFile";
import { ColumnSelector } from "./ColumnSelector";
import { ChartGrid, type ChartGridRef } from "./ChartGrid";
import { ExportChartsDialog } from "./ExportChartsDialog";

export interface LoadedFileViewProps {
  runFile: RunFile;
  problems: Problem[] | null;
  showWarnings: boolean;
  setShowWarnings: (show: boolean) => void;
  selectedColumns: string[];
  onSelectionChange: (selected: string[]) => void;
}

export function LoadedFileView({
  runFile,
  problems,
  showWarnings,
  setShowWarnings,
  selectedColumns,
  onSelectionChange,
}: LoadedFileViewProps) {
  const dataColumns = runFile.dataColumns();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const chartGridRef = useRef<ChartGridRef>(null);

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

  return (
    <>
      {problems && problems.length > 0 && showWarnings && (
        <div className="warning-banner">
          <button
            type="button"
            className="warning-banner-close"
            onClick={() => setShowWarnings(false)}
            aria-label="Dismiss warnings"
          >
            &times;
          </button>
          <div className="warning-banner-content">
            <strong>Warnings for this file:</strong>
            <ul>
              {problems.map((p, idx) => (
                <li key={idx}>{p.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ColumnSelector
        dataColumns={dataColumns}
        selectedColumns={selectedColumns}
        onSelectionChange={onSelectionChange}
      />
      <div className="chart-grid-scroll">
        <ChartGrid
          ref={chartGridRef}
          runFile={runFile}
          selectedColumnNames={selectedColumns}
        />
      </div>
      <ExportChartsDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getChartInstances={() => chartGridRef.current?.getChartInstances() ?? []}
        chartNames={selectedColumns}
      />
    </>
  );
}
