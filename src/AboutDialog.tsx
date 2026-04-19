import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  Text,
  tokens,
} from "@fluentui/react-components";

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  version: string;
  intro: string;
  productHomepage: string;
  /** Optional icon slot (provide an <img> sized for DPI, etc.). */
  icon?: ReactNode;
  onOpenProductHomepage: () => void;
}

export function AboutDialog({
  open,
  onOpenChange,
  title,
  version,
  intro,
  productHomepage,
  icon,
  onOpenProductHomepage,
}: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
      <DialogSurface style={{ maxWidth: 360 }}>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
              {icon ? <div style={{ flex: "none" }}>{icon}</div> : null}
              <span>{title || "RASOrbit Viewer"}</span>
            </div>
          </DialogTitle>
          <DialogContent>
            <Text block>Version {version}</Text>
            <Text block style={{ marginTop: tokens.spacingVerticalM }}>
              {intro}
            </Text>
            <div style={{ marginTop: tokens.spacingVerticalS }}>
              <Link
                href={productHomepage}
                onClick={(e) => {
                  e.preventDefault();
                  onOpenProductHomepage();
                }}
              >
                Product site
              </Link>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => onOpenChange(false)}>
              OK
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

