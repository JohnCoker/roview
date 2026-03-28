import { useState, useEffect, useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, message as showDialogMessage } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Button, Spinner, Text, tokens } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-theme";
import { RunFile, Problem } from "./RunFile";
import { LoadedFileView } from "./LoadedFileView";
import "./App.css";

export interface AppProps {
  theme: Theme;
}

function App({ theme }: AppProps) {
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [runFile, setRunFile] = useState<RunFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [showWarnings, setShowWarnings] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  /** True only while readTextFile + validation for currentFilePath are in flight. */
  const [isReadingFile, setIsReadingFile] = useState(false);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);
    return () => window.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  useEffect(() => {
    invoke<string[]>("get_pending_open_files").then((paths) => {
      if (paths.length > 0) {
        paths.forEach((p) => invoke("add_recent", { path: p }));
        setCurrentFilePath(paths[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!currentFilePath) {
      setRunFile(null);
      setProblems(null);
      setLoadError(null);
      setIsReadingFile(false);
      return;
    }

    setLoadError(null);
    setProblems(null);
    setShowWarnings(true);
    setIsReadingFile(true);

    readTextFile(currentFilePath)
      .then(async (content) => {
        try {
          const run = new RunFile(currentFilePath, content);
          const validation = run.validate();
          const allProblems = validation.all();
          setProblems(allProblems);

          if (validation.hasErrors()) {
            const errorMessages = allProblems
              .filter((p) => p.severity === "error")
              .map((p) => `• ${p.message}`)
              .join("\n");

            await showDialogMessage(
              errorMessages || "This file is not usable.",
              { title: "Cannot open file", kind: "error" },
            );

            setRunFile(null);
            return;
          }

          setRunFile(run);
        } finally {
          setIsReadingFile(false);
        }
      })
      .catch((err: unknown) => {
        setIsReadingFile(false);
        setRunFile(null);
        setProblems(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [currentFilePath]);

  useEffect(() => {
    if (!runFile) return;
    const dataCols = runFile.dataColumns();
    setSelectedColumns(dataCols.slice(0, 4).map((c) => c.name));
  }, [runFile?.path]);

  useEffect(() => {
    const enabled = !!runFile;
    invoke("set_view_columns_enabled", { enabled }).catch(() => {});
  }, [runFile]);

  useEffect(() => {
    const enabled = runFile != null && runFile.locationColumns() != null;
    invoke("set_location_enabled", { enabled }).catch(() => {});
  }, [runFile]);

  useLayoutEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];
    (async () => {
      const fns = await Promise.all([
        listen("menu-open-dialog", () => {
          void (async () => {
            const selected = await openDialog({
              multiple: false,
              filters: [
                { name: "CSV", extensions: ["csv"] },
                { name: "All", extensions: ["*"] },
              ],
            });
            if (selected !== null) {
              const path = typeof selected === "string" ? selected : selected[0];
              if (path) {
                await invoke("add_recent", { path });
                setCurrentFilePath(path);
              }
            }
          })();
        }),
        listen<string>("open-file", (e) => {
          const path = e.payload;
          void (async () => {
            await invoke("add_recent", { path });
            setCurrentFilePath(path);
          })();
        }),
        listen<string[]>("open-files", (e) => {
          const paths = e.payload;
          void (async () => {
            for (const p of paths) {
              await invoke("add_recent", { path: p });
            }
            if (paths.length > 0) setCurrentFilePath(paths[0]);
          })();
        }),
      ]);
      if (cancelled) {
        fns.forEach((u) => u());
        return;
      }
      unlisteners = fns;
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  const isEmpty = !currentFilePath;
  const openingFile = isReadingFile;

  const loadingStyle = {
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: tokens.spacingVerticalM,
    flex: 1,
    padding: tokens.spacingHorizontalM,
  };

  if (isEmpty) {
    return (
      <main
        className="container container--empty"
        style={{
          backgroundColor: theme.colorNeutralBackground1,
          color: theme.colorNeutralForeground1,
        }}
      >
        <p>Use File → Open… or open a CSV via the system.</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        className="container"
        style={{
          backgroundColor: theme.colorNeutralBackground1,
          color: theme.colorNeutralForeground1,
        }}
      >
        <p className="load-error">{loadError}</p>
      </main>
    );
  }

  if (openingFile) {
    return (
      <main
        className="container container--empty"
        style={{
          backgroundColor: theme.colorNeutralBackground1,
          color: theme.colorNeutralForeground1,
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div style={loadingStyle}>
          <Spinner size="large" label="Opening file…" />
          <Text size={300}>Parsing CSV…</Text>
        </div>
      </main>
    );
  }

  if (!runFile) {
    return null;
  }

  return (
    <main
      className="container"
      style={{
        backgroundColor: theme.colorNeutralBackground1,
        color: theme.colorNeutralForeground1,
      }}
    >
      {problems && problems.length > 0 && showWarnings && (
        <div
          className="warning-banner"
          style={{
            padding: "12px 16px",
            borderRadius: tokens.borderRadiusLarge,
            border: `1px solid ${tokens.colorPaletteYellowBorder1}`,
            backgroundColor: tokens.colorPaletteYellowBackground2,
            color: tokens.colorNeutralForeground1,
          }}
        >
          <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Warnings for this file</div>
              <ul className="warning-banner-list">
                {problems.map((p, idx) => (
                  <li key={idx}>{p.message}</li>
                ))}
              </ul>
            </div>
            <Button appearance="subtle" onClick={() => setShowWarnings(false)} aria-label="Dismiss warnings">
              ×
            </Button>
          </div>
        </div>
      )}
      <LoadedFileView
        runFile={runFile}
        theme={theme}
        selectedColumns={selectedColumns}
        onSelectionChange={setSelectedColumns}
      />
    </main>
  );
}

export default App;
