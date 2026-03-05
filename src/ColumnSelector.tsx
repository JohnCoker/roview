import { useState } from "react";
import type { Col } from "./RunFile";
import { ColumnSelectDialog } from "./ColumnSelectDialog";

export interface ColumnSelectorProps {
  dataColumns: Col[];
  selectedColumns: string[];
  onSelectionChange: (selected: string[]) => void;
}

const MAX_NAMES_SHOWN = 5;

export function ColumnSelector({
  dataColumns,
  selectedColumns,
  onSelectionChange,
}: ColumnSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const namesShown = selectedColumns.slice(0, MAX_NAMES_SHOWN);
  const extraCount = selectedColumns.length - MAX_NAMES_SHOWN;
  const summary =
    extraCount > 0
      ? `${namesShown.join(", ")} +${extraCount} more`
      : selectedColumns.join(", ") || "None selected";

  return (
    <div className="column-selector">
      <span className="column-selector-label">Columns:</span>
      <span className="column-selector-summary" title={selectedColumns.join(", ")}>
        {summary}
      </span>
      <button
        type="button"
        className="column-selector-button"
        onClick={() => setDialogOpen(true)}
      >
        Select…
      </button>
      <ColumnSelectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dataColumns={dataColumns}
        selectedColumns={selectedColumns}
        onApply={onSelectionChange}
      />
    </div>
  );
}
