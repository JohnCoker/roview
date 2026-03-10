import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, message as showDialogMessage } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { RunFile, Problem } from "./RunFile";
import { LoadedFileView } from "./LoadedFileView";
import "./App.css";

function App() {
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
    <main className={`container ${isEmpty ? "container--empty" : ""}`}>
      {isEmpty ? (
        <p>Use File → Open… or open a CSV via the system.</p>
      ) : loadError ? (
        <p className="load-error">{loadError}</p>
      ) : runFile ? (
        <LoadedFileView
          runFile={runFile}
          problems={problems}
          showWarnings={showWarnings}
          setShowWarnings={setShowWarnings}
          selectedColumns={selectedColumns}
          onSelectionChange={setSelectedColumns}
        />
      ) : null}
    </main>
  );
}

export default App;
