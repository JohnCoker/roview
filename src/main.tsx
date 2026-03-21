import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";

/** Native webview chrome before React runs; matches Fluent light/dark via system preference. */
function syncWebviewBackgroundToSystemTheme(): void {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const bg = (prefersDark ? webDarkTheme : webLightTheme).colorNeutralBackground1;
  void getCurrentWebviewWindow().setBackgroundColor(bg).catch(() => {});
}

syncWebviewBackgroundToSystemTheme();

function Root() {
  const [prefersDark, setPrefersDark] = React.useState(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const theme = prefersDark ? webDarkTheme : webLightTheme;

  React.useEffect(() => {
    getCurrentWebviewWindow().setBackgroundColor(theme.colorNeutralBackground1).catch(() => {});
  }, [theme]);

  return (
    <FluentProvider theme={theme}>
      <App theme={theme} />
    </FluentProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
