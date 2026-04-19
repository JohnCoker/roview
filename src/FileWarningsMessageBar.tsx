import { Button, tokens } from "@fluentui/react-components";
import {
  MessageBar,
  MessageBarActions,
  MessageBarBody,
} from "@fluentui/react-message-bar";

/** Keep in sync with `.chart-grid-scroll` horizontal padding in `App.css` and `UpgradeNotificationBar`. */
const CHART_GUTTER = "0.5rem";

export interface FileWarningsMessageBarProps {
  /** All validation problem messages for the loaded file (any severity). */
  messages: readonly string[];
  onDismiss: () => void;
}

/**
 * Non-blocking file validation messages, using the same MessageBar pattern as the upgrade
 * notification so light/dark themes stay correct.
 */
export function FileWarningsMessageBar({ messages, onDismiss }: FileWarningsMessageBarProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: "stretch",
        width: "100%",
        boxSizing: "border-box",
        paddingLeft: CHART_GUTTER,
        paddingRight: CHART_GUTTER,
        paddingTop: CHART_GUTTER,
        textAlign: "left",
      }}
    >
      <MessageBar intent="warning" layout="auto" politeness="polite">
        <MessageBarBody>
          <div>
            <strong>Warnings for this file:</strong>
            <ul
              style={{
                marginTop: tokens.spacingVerticalS,
                marginBottom: 0,
                paddingLeft: tokens.spacingHorizontalXL,
              }}
            >
              {messages.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={onDismiss} aria-label="Dismiss warnings">
            Dismiss
          </Button>
        </MessageBarActions>
      </MessageBar>
    </div>
  );
}
