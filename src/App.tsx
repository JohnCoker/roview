import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, message as showDialogMessage } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Button, tokens } from "@fluentui/react-components";
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
      return;
    }

    setLoadError(null);
    setProblems(null);
    setShowWarnings(true);

    readTextFile(currentFilePath)
      .then(async (content) => {
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
      })
      .catch((err: unknown) => {
        setRunFile(null);
        setProblems(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [currentFilePath]);

  useEffect(() => {
    if (!runFile) return;
    const dataCols = runFile.dataColumns();
    setSelectedColumns(dataCols.slice(0, 3).map((c) => c.name));
  }, [runFile?.path]);

  useEffect(() => {
    const enabled = !!runFile;
    invoke("set_view_columns_enabled", { enabled }).catch(() => {});
  }, [runFile]);

  useEffect(() => {
    const unlistenOpenDialog = listen("menu-open-dialog", async () => {
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
    });

    const unlistenOpenFile = listen<string>("open-file", async (event) => {
      const path = event.payload;
      await invoke("add_recent", { path });
      setCurrentFilePath(path);
    });

    const unlistenOpenFiles = listen<string[]>("open-files", async (event) => {
      const paths = event.payload;
      for (const p of paths) {
        await invoke("add_recent", { path: p });
      }
      if (paths.length > 0) setCurrentFilePath(paths[0]);
    });

    return () => {
      unlistenOpenDialog.then((fn) => fn());
      unlistenOpenFile.then((fn) => fn());
      unlistenOpenFiles.then((fn) => fn());
    };
  }, []);

  const isEmpty = !currentFilePath;

  return (
    <main
      className={`container ${isEmpty ? "container--empty" : ""}`}
      style={{
        backgroundColor: theme.colorNeutralBackground1,
        color: theme.colorNeutralForeground1,
      }}
    >
      {isEmpty ? (
        <p>Use File → Open… or open a CSV via the system.</p>
      ) : loadError ? (
        <p className="load-error">{loadError}</p>
      ) : runFile ? (
        <>
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
        </>
      ) : null}
    </main>
  );
}

export default App;
