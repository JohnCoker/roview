import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, tokens } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";

export interface ChartErrorBoundaryProps {
  /** Shown in the fallback and logged (e.g. column name or "Map Trace"). */
  chartLabel: string;
  theme: Theme;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates ECharts / option-builder failures so one bad chart does not blank the whole grid.
 * (React error boundaries do not catch async errors or event-handler throws.)
 */
export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Chart "${this.props.chartLabel}" failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { theme, chartLabel, children } = this.props;
    if (this.state.error != null) {
      return (
        <div
          style={{
            padding: tokens.spacingHorizontalM,
            border: `${tokens.strokeWidthThin} solid ${theme.colorNeutralStroke1}`,
            borderRadius: tokens.borderRadiusMedium,
            backgroundColor: theme.colorNeutralBackground1,
            color: theme.colorNeutralForeground1,
            minHeight: 200,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Text weight="semibold">Could not render this chart ({chartLabel})</Text>
          <Text
            style={{
              marginTop: tokens.spacingVerticalS,
              fontFamily: tokens.fontFamilyMonospace,
              fontSize: tokens.fontSizeBase200,
              color: theme.colorNeutralForeground2,
            }}
          >
            {this.state.error.message}
          </Text>
        </div>
      );
    }
    return children;
  }
}
