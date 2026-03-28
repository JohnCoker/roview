import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { setTheme } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";

function isWindowsPlatform(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

/**
 * Before React: align webview with the shell. On Windows 11+ we use `mica` in `tauri.windows.conf.json`
 * (requires a transparent webview); keep the webview surface transparent so DWM can composite Mica,
 * and let Fluent `App` fill the viewport with `theme.colorNeutralBackground1`.
 * On other platforms, paint the webview with the same neutral background as the app.
 */
function syncWebviewBackgroundToSystemTheme(): void {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const w = getCurrentWebviewWindow();
  if (isWindowsPlatform()) {
    void w.setBackgroundColor({ red: 0, green: 0, blue: 0, alpha: 0 }).catch(() => {});
  } else {
    const bg = (prefersDark ? webDarkTheme : webLightTheme).colorNeutralBackground1;
    void w.setBackgroundColor(bg).catch(() => {});
  }
  void setTheme(prefersDark ? "dark" : "light").catch(() => {});
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
    const w = getCurrentWebviewWindow();
    if (isWindowsPlatform()) {
      void w.setBackgroundColor({ red: 0, green: 0, blue: 0, alpha: 0 }).catch(() => {});
    } else {
      void w.setBackgroundColor(theme.colorNeutralBackground1).catch(() => {});
    }
    void setTheme(prefersDark ? "dark" : "light").catch(() => {});
  }, [theme, prefersDark]);

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
