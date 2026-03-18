use std::path::PathBuf;
use std::sync::Arc;
use std::sync::RwLock;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

const MAX_RECENTS: usize = 10;
const RECENTS_STORE_PATH: &str = "recents.json";

#[derive(Default)]
pub struct AppState {
    pub recent_files: RwLock<Vec<PathBuf>>,
    pub pending_open_files: RwLock<Vec<PathBuf>>,
    pub export_charts_enabled: RwLock<bool>,
    pub view_columns_enabled: RwLock<bool>,
    pub map_trace_enabled: RwLock<bool>,
}

fn build_file_submenu(
    handle: &tauri::AppHandle,
    state: &AppState,
) -> tauri::Result<Submenu<tauri::Wry>> {
    let recents = state
        .recent_files
        .read()
        .map(|r| r.clone())
        .unwrap_or_default();

    let mut recents_builder = SubmenuBuilder::with_id(handle, "recents", "Open Recent");
    for (i, path) in recents.iter().take(MAX_RECENTS).enumerate() {
        let label: String = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(String::from)
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        recents_builder = recents_builder.text(format!("recent-{}", i), label);
    }
    let recents_submenu = recents_builder.build()?;

    let export_enabled = state
        .export_charts_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let export_item = MenuItemBuilder::with_id("file-export-charts", "Export Charts…")
        .enabled(export_enabled)
        .build(handle)?;

    let file_submenu = SubmenuBuilder::with_id(handle, "file", "File")
        .text("file-open", "Open File…")
        .item(&recents_submenu)
        .separator()
        .item(&export_item)
        .separator();

    // On Windows, add Exit at bottom of File menu; on macOS Quit stays in app menu.
    #[cfg(windows)]
    let file_submenu = file_submenu.text("file-exit", "Exit");

    let file_submenu = file_submenu.build()?;

    Ok(file_submenu)
}

fn build_app_menu(handle: &tauri::AppHandle, state: &AppState) -> tauri::Result<Menu<tauri::Wry>> {
    let file_submenu = build_file_submenu(handle, state)?;

    let view_enabled = state
        .view_columns_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let map_trace_enabled = state
        .map_trace_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let first_three_item =
        MenuItemBuilder::with_id("view-first-3-columns", "First 3 Columns").enabled(view_enabled).build(handle)?;
    let all_columns_item =
        MenuItemBuilder::with_id("view-all-columns", "All Columns").enabled(view_enabled).build(handle)?;
    let select_columns_item =
        MenuItemBuilder::with_id("view-select-columns", "Select Columns…").enabled(view_enabled).build(handle)?;
    let map_trace_item =
        MenuItemBuilder::with_id("view-map-trace", "Map Trace").enabled(map_trace_enabled).build(handle)?;

    let view_submenu = SubmenuBuilder::with_id(handle, "view", "View")
        .item(&first_three_item)
        .item(&all_columns_item)
        .item(&select_columns_item)
        .separator()
        .item(&map_trace_item)
        .build()?;

    if cfg!(target_os = "macos") {
        let app_submenu = SubmenuBuilder::with_id(handle, "app", "RASOrbit Viewer")
            .quit_with_text("Quit RASOrbit Viewer")
            .build()?;
        MenuBuilder::new(handle)
            .item(&app_submenu)
            .item(&file_submenu)
            .item(&view_submenu)
            .build()
    } else {
        MenuBuilder::new(handle)
            .item(&file_submenu)
            .item(&view_submenu)
            .build()
    }
}

fn load_recents_from_store(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let store = match app.store(RECENTS_STORE_PATH) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let value = match store.get("recents") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let arr: Vec<String> = match serde_json::from_value(value.clone()) {
        Ok(a) => a,
        Err(_) => return Vec::new(),
    };
    arr.into_iter().map(PathBuf::from).collect()
}

fn save_recents_to_store(
    app: &tauri::AppHandle,
    paths: &[PathBuf],
) -> Result<(), tauri_plugin_store::Error> {
    let store = app.store(RECENTS_STORE_PATH)?;
    let arr: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    store.set("recents".to_string(), serde_json::to_value(arr).unwrap_or_default());
    store.save()
}

#[tauri::command]
fn get_pending_open_files(state: tauri::State<Arc<AppState>>) -> Vec<PathBuf> {
    state
        .pending_open_files
        .write()
        .map(|mut g| std::mem::take(g.as_mut()))
        .unwrap_or_default()
}

#[tauri::command]
fn set_export_charts_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .export_charts_enabled
        .write()
        .map(|mut g| *g = enabled)
        .map_err(|e| e.to_string())?;
    if let Ok(menu) = build_app_menu(&app, &state) {
        let _ = app.set_menu(menu);
    }
    Ok(())
}

#[tauri::command]
fn set_view_columns_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .view_columns_enabled
        .write()
        .map(|mut g| *g = enabled)
        .map_err(|e| e.to_string())?;
    if let Ok(menu) = build_app_menu(&app, &state) {
        let _ = app.set_menu(menu);
    }
    Ok(())
}

#[tauri::command]
fn set_map_trace_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .map_trace_enabled
        .write()
        .map(|mut g| *g = enabled)
        .map_err(|e| e.to_string())?;
    if let Ok(menu) = build_app_menu(&app, &state) {
        let _ = app.set_menu(menu);
    }
    Ok(())
}

#[tauri::command]
fn add_recent(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if !path.is_file() {
        return Ok(());
    }
    {
        let mut recents = state.recent_files.write().map_err(|e| e.to_string())?;
        recents.retain(|p| p != &path);
        recents.insert(0, path.clone());
        if recents.len() > MAX_RECENTS {
            recents.truncate(MAX_RECENTS);
        }
        let paths: Vec<PathBuf> = recents.clone();
        drop(recents);
        save_recents_to_store(&app, &paths).map_err(|e| e.to_string())?;
    }
    if let Ok(menu) = build_app_menu(&app, &state) {
        let _ = app.set_menu(menu);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            get_pending_open_files,
            add_recent,
            set_export_charts_enabled,
            set_view_columns_enabled,
            set_map_trace_enabled,
        ])
        .setup(move |app| {
            // Load persistent recents into state
            let loaded = load_recents_from_store(app.handle());
            if !loaded.is_empty() {
                if let Ok(mut recents) = state.recent_files.write() {
                    *recents = loaded;
                }
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                let mut files = Vec::new();
                for arg in std::env::args().skip(1) {
                    if arg.starts_with('-') {
                        continue;
                    }
                    if let Ok(url) = tauri::Url::parse(&arg) {
                        if url.scheme() == "file" {
                            if let Ok(path) = url.to_file_path() {
                                files.push(path);
                            }
                        }
                    } else {
                        files.push(PathBuf::from(arg));
                    }
                }
                if !files.is_empty() {
                    if let Ok(mut pending) = state.pending_open_files.write() {
                        pending.extend(files);
                    }
                }
            }

            let menu = build_app_menu(app.handle(), &state).map_err(|e| e.to_string())?;
            app.set_menu(menu).map_err(|e| e.to_string())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(move |app_handle, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                let files: Vec<PathBuf> = urls
                    .into_iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .collect();
                if !files.is_empty() {
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        if let Ok(mut pending) = state.pending_open_files.write() {
                            pending.extend(files.iter().cloned());
                        }
                        if let Ok(mut recents) = state.recent_files.write() {
                            for f in files.iter().rev() {
                                recents.retain(|p| p != f);
                                recents.insert(0, f.clone());
                            }
                            if recents.len() > MAX_RECENTS {
                                recents.truncate(MAX_RECENTS);
                            }
                            let paths: Vec<PathBuf> = recents.clone();
                            drop(recents);
                            let _ = save_recents_to_store(&app_handle, &paths);
                        }
                    }
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let path_strings: Vec<String> = files
                            .into_iter()
                            .map(|p| p.to_string_lossy().into_owned())
                            .collect();
                        let _ = w.emit("open-files", path_strings);
                    }
                }
                return;
            }

            if let tauri::RunEvent::MenuEvent(e) = event {
                let id = e.id().0.as_str();
                if id == "file-open" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("menu-open-dialog", ());
                    }
                    return;
                }
                if id == "file-export-charts" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("menu-export-charts", ());
                    }
                    return;
                }
                if id == "view-first-3-columns" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-first-3-columns", ());
                    }
                    return;
                }
                if id == "view-all-columns" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-all-columns", ());
                    }
                    return;
                }
                if id == "view-select-columns" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-select-columns", ());
                    }
                    return;
                }
                if id == "view-map-trace" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-map-trace", ());
                    }
                    return;
                }
                if id == "file-exit" {
                    app_handle.exit(0);
                    return;
                }
                if id.starts_with("recent-") {
                    if let Ok(idx) = id.trim_start_matches("recent-").parse::<usize>() {
                        if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                            let path = state.recent_files.read().ok().and_then(|r| r.get(idx).cloned());
                            if let Some(p) = path {
                                if let Some(w) = app_handle.get_webview_window("main") {
                                    let _ = w.emit("open-file", p.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        });
}
