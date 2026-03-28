import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, tokens } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";

export interface UiErrorBoundaryProps {
  theme: Theme;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the loaded-file shell (menu listeners, ChartGrid, dialogs).
 * Per-chart failures stay inside {@link ChartErrorBoundary}.
 */
export class UiErrorBoundary extends Component<UiErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Loaded view render failed", error, info.componentStack);
  }

  override render(): ReactNode {
    const { theme, children } = this.props;
    if (this.state.error != null) {
      return (
        <div
          style={{
            padding: tokens.spacingHorizontalM,
            border: `${tokens.strokeWidthThin} solid ${theme.colorNeutralStroke1}`,
            borderRadius: tokens.borderRadiusMedium,
            backgroundColor: theme.colorNeutralBackground1,
            color: theme.colorNeutralForeground1,
            margin: tokens.spacingHorizontalM,
          }}
        >
          <Text weight="semibold">Something went wrong</Text>
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
