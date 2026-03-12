import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import App from "./App";

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

  return (
    <FluentProvider theme={prefersDark ? webDarkTheme : webLightTheme}>
      <App theme={prefersDark ? webDarkTheme : webLightTheme} />
    </FluentProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
