import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@fluentui/react-components";
import {
  MessageBar,
  MessageBarActions,
  MessageBarBody,
} from "@fluentui/react-message-bar";
import { checkReleaseAgainstApp } from "./checkGithubRelease";
import { PRODUCT_HOMEPAGE } from "./productSite";
import { formatNewerReleaseMessage } from "./upgradeCopy";

export function UpgradeNotificationBar() {
  const [ready, setReady] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [newer, setNewer] = useState<{ latest: string; current: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isSuppressed = await invoke<boolean>("get_suppress_upgrade_notifications");
        if (cancelled) return;
        if (isSuppressed) {
          setSuppressed(true);
          setReady(true);
          return;
        }
        const ac = new AbortController();
        abortRef.current = ac;
        const result = await checkReleaseAgainstApp({ signal: ac.signal });
        if (cancelled) return;
        if (result.status === "newer") {
          setNewer({ latest: result.latestDisplay, current: result.currentDisplay });
        }
      } catch {
        /* stay quiet on fetch failure (same as failed result) */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const onIgnore = async () => {
    await invoke("set_suppress_upgrade_notifications", { suppressed: true });
    setNewer(null);
  };

  const onUpgrade = async () => {
    await openUrl(PRODUCT_HOMEPAGE);
    await invoke("request_exit");
  };

  if (!ready || suppressed || sessionDismissed || !newer) {
    return null;
  }

  const body = formatNewerReleaseMessage(newer.latest, newer.current);

  /** Keep in sync with `.chart-grid-scroll` horizontal padding in `App.css` and `FileWarningsMessageBar`. */
  const chartGutter = "0.5rem";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: "stretch",
        width: "100%",
        boxSizing: "border-box",
        paddingLeft: chartGutter,
        paddingRight: chartGutter,
        paddingTop: chartGutter,
        textAlign: "left",
      }}
    >
      <MessageBar intent="info" layout="auto" politeness="polite">
        <MessageBarBody>{body}</MessageBarBody>
        <MessageBarActions>
          <Button appearance="primary" title="close and go to download page" onClick={() => void onUpgrade()}>
            Upgrade
          </Button>
          <Button appearance="secondary" title="close notification for this session" onClick={() => setSessionDismissed(true)}>
            Later
          </Button>
          <Button appearance="secondary" title="do not check for upgrades" onClick={() => void onIgnore()}>
            Ignore
          </Button>
        </MessageBarActions>
      </MessageBar>
    </div>
  );
}
