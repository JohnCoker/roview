import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
} from "@fluentui/react-components";
import type { ReleaseCheckResult } from "./checkGithubRelease";
import { checkReleaseAgainstApp } from "./checkGithubRelease";
import { PRODUCT_HOMEPAGE } from "./productSite";
import { CANNOT_CHECK_RELEASE_MESSAGE, formatNewerReleaseMessage } from "./upgradeCopy";

type DialogPhase = "idle" | "loading" | "done";

export function VersionCheckDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<DialogPhase>("idle");
  const [result, setResult] = useState<ReleaseCheckResult | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPhase("idle");
    setResult(null);
  }, []);

  const runCheck = useCallback(async () => {
    setPhase("loading");
    setResult(null);
    try {
      await invoke("set_suppress_upgrade_notifications", { suppressed: false });
      const r = await checkReleaseAgainstApp();
      setResult(r);
    } catch {
      setResult({ status: "failed" });
    } finally {
      setPhase("done");
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("check-for-new-version", () => {
      setOpen(true);
      void runCheck();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [runCheck]);

  const onUpgrade = async () => {
    await openUrl(PRODUCT_HOMEPAGE);
    await invoke("request_exit");
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className="app-dialog-surface" style={{ maxWidth: 380 }}>
        <DialogBody>
          <DialogTitle>Check for Updates</DialogTitle>
          <DialogContent>
            {phase === "loading" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
                <Spinner size="medium" label="Checking…" />
              </div>
            )}
            {phase === "done" && result?.status === "upToDate" && (
              <Text block>You are already on the latest version {result.version}.</Text>
            )}
            {phase === "done" && result?.status === "newer" && (
              <Text block>{formatNewerReleaseMessage(result.latestDisplay, result.currentDisplay)}</Text>
            )}
            {phase === "done" && result?.status === "failed" && (
              <Text block>{CANNOT_CHECK_RELEASE_MESSAGE}</Text>
            )}
          </DialogContent>
          <DialogActions>
            {phase === "done" && result?.status === "newer" ? (
              <>
                <Button appearance="primary" onClick={() => void onUpgrade()}>
                  Upgrade
                </Button>
                <Button appearance="secondary" onClick={close}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button appearance="primary" onClick={close} disabled={phase === "loading"}>
                OK
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
