import { useState, useEffect } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Tooltip,
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
import type { Col, RunFile } from "./RunFile";
import { LAT_LONG_LINE_LABEL, LAT_LONG_LINE_SELECTION } from "./util";

/** Tooltip: exact CSV headers (includes units in parentheses when present). */
function dataColumnTooltip(col: Col, timeColumn: Col): string {
  return `${col.name} vs ${timeColumn.name}`;
}

function latLongLineTooltip(lat: Col, long: Col): string {
  return `${lat.name} vs ${long.name}`;
}

export interface ColumnSelectDialogProps {
  open: boolean;
  onClose: () => void;
  runFile: RunFile;
  selectedColumns: string[];
  onApply: (selected: string[]) => void;
}

export function ColumnSelectDialog({
  open,
  onClose,
  runFile,
  selectedColumns,
  onApply,
}: ColumnSelectDialogProps) {
  const timeColumn = runFile.timeColumn();
  if (timeColumn == null) {
    return null;
  }
  const dataColumns = runFile.dataColumns();
  const locationColumns = runFile.locationColumns();
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

  const selectFirstFour = () => {
    setPending(new Set(runFile.dataColumns().slice(0, 4).map((c) => c.name)));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_e, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className="app-dialog-surface" style={{ maxWidth: 420 }}>
        <DialogBody>
          <DialogTitle
            action={
              <DialogTrigger action="close" disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  aria-label="Close"
                  icon={<Dismiss24Regular />}
                  size="small"
                />
              </DialogTrigger>
            }
          >
            Columns to Chart
          </DialogTitle>
          <DialogContent style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {dataColumns.map((col) => (
              <div key={col.name} style={{ paddingBlock: "2px" }}>
                <Tooltip content={dataColumnTooltip(col, timeColumn)} relationship="description" withArrow>
                  {/* Checkbox ref goes to the hidden input; wrap so hover covers label + box. */}
                  <span style={{ display: "inline-flex", alignItems: "center", maxWidth: "100%" }}>
                    <Checkbox
                      checked={pending.has(col.name)}
                      label={col.kind()}
                      onChange={() => toggle(col.name)}
                    />
                  </span>
                </Tooltip>
              </div>
            ))}
            {locationColumns != null && (
              <div style={{ paddingBlock: "2px" }}>
                <Tooltip
                  content={latLongLineTooltip(locationColumns.lat, locationColumns.long)}
                  relationship="description"
                  withArrow
                >
                  <span style={{ display: "inline-flex", alignItems: "center", maxWidth: "100%" }}>
                    <Checkbox
                      checked={pending.has(LAT_LONG_LINE_SELECTION)}
                      label={LAT_LONG_LINE_LABEL}
                      onChange={() => toggle(LAT_LONG_LINE_SELECTION)}
                    />
                  </span>
                </Tooltip>
              </div>
            )}
          </DialogContent>
          <DialogActions position="start">
            <Button appearance="secondary" onClick={selectFirstFour}>
              First 4
            </Button>
          </DialogActions>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={handleApply}>
              OK
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
