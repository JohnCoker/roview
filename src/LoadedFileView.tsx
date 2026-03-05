import type { RunFile, Problem } from "./RunFile";
import { ColumnSelector } from "./ColumnSelector";
import { ChartGrid } from "./ChartGrid";

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
        <ChartGrid runFile={runFile} selectedColumnNames={selectedColumns} />
      </div>
    </>
  );
}
