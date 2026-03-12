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
} from "@fluentui/react-components";
import { Dismiss24Regular } from "@fluentui/react-icons";
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
                <Checkbox
                  checked={pending.has(col.name)}
                  label={col.name}
                  onChange={() => toggle(col.name)}
                />
              </div>
            ))}
          </DialogContent>
          <DialogActions position="start">
            <Button appearance="secondary" onClick={selectFirstThree}>
              First 3
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
