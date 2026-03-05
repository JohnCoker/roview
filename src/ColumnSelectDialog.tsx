import { useState, useEffect } from "react";
import type { Col } from "./RunFile";

export interface ColumnSelectDialogProps {
  open: boolean;
  onClose: () => void;
  dataColumns: Col[];
  selectedColumns: string[];
  onApply: (selected: string[]) => void;
}

export function ColumnSelectDialog({
  open,
  onClose,
  dataColumns,
  selectedColumns,
  onApply,
}: ColumnSelectDialogProps) {
  const [pending, setPending] = useState<Set<string>>(new Set(selectedColumns));

  useEffect(() => {
    if (open) {
      setPending(new Set(selectedColumns));
    }
  }, [open, selectedColumns]);

  const toggle = (name: string) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from(pending));
    onClose();
  };

  const selectFirstThree = () => {
    setPending(new Set(dataColumns.slice(0, 3).map((c) => c.name)));
  };

  if (!open) return null;

  return (
    <dialog className="column-select-dialog" open={open}>
      <div className="column-select-dialog-content">
        <div className="column-select-dialog-header">
          <h2>Select columns to chart</h2>
          <button type="button" className="column-select-dialog-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="column-select-dialog-list">
          {dataColumns.map((col) => (
            <label key={col.name} className="column-select-dialog-row">
              <input
                type="checkbox"
                checked={pending.has(col.name)}
                onChange={() => toggle(col.name)}
              />
              <span>{col.name}</span>
            </label>
          ))}
        </div>
        <div className="column-select-dialog-actions">
          <button type="button" onClick={selectFirstThree}>
            First 3
          </button>
          <div className="column-select-dialog-actions-right">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleApply}>
              OK
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
