use std::path::PathBuf;
use std::sync::Arc;
use std::sync::RwLock;
#[cfg(not(windows))]
use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
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
    pub location_enabled: RwLock<bool>,
}

#[cfg(not(windows))]
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

/// PNG embedded at build time so the native About panel shows the app icon in dev and bundled builds.
#[cfg(not(windows))]
fn about_icon_png() -> Option<tauri::image::Image<'static>> {
    const BYTES: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/128x128.png"));
    tauri::image::Image::from_bytes(BYTES)
        .ok()
        .map(|i| i.to_owned())
}

#[cfg(not(windows))]
fn primary_cargo_author(authors: &str) -> Option<String> {
    let a = authors.trim();
    if a.is_empty() {
        return None;
    }
    Some(
        a.split(':')
            .next()
            .unwrap_or(a)
            .trim()
            .to_string(),
    )
}

#[cfg(not(windows))]
fn nonempty_string(opt: &Option<String>) -> Option<String> {
    opt.as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(not(windows))]
const ABOUT_INTRO: &str =
    "Desktop app for exploring time-series CSV output produced by RASOrbit.";

#[cfg(not(windows))]
fn about_metadata(handle: &tauri::AppHandle) -> AboutMetadata<'static> {
    let pkg = handle.package_info();
    let config = handle.config();
    let bundle = &config.bundle;
    let name = config
        .product_name
        .clone()
        .unwrap_or_else(|| pkg.name.clone());

    let publisher = nonempty_string(&bundle.publisher)
        .or_else(|| primary_cargo_author(pkg.authors));
    let copyright = nonempty_string(&bundle.copyright);
    let homepage = nonempty_string(&bundle.homepage);
    let license = nonempty_string(&bundle.license);

    let website_label = homepage.as_ref().map(|url| {
        if url.contains("github.com") {
            "GitHub".to_string()
        } else {
            "Website".to_string()
        }
    });

    #[cfg(target_os = "macos")]
    let credits = about_macos_credits(&copyright, &publisher, &homepage, &license);
    #[cfg(not(target_os = "macos"))]
    let credits: Option<String> = None;

    // Windows/Linux About already lists authors, website, copyright; keep comments as description only.
    let comments = Some(ABOUT_INTRO.to_string());

    AboutMetadata {
        name: Some(name),
        version: Some(pkg.version.to_string()),
        authors: about_authors_list(&publisher),
        comments,
        copyright: copyright.clone(),
        license,
        website: homepage.clone(),
        website_label,
        credits,
        icon: about_icon_png(),
        ..Default::default()
    }
}

#[cfg(not(windows))]
fn about_authors_list(publisher: &Option<String>) -> Option<Vec<String>> {
    let p = publisher.as_ref()?.trim();
    if p.is_empty() {
        return None;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some((name, rest)) = p.split_once('<') {
            let email = rest.trim_end_matches('>').trim();
            if !name.trim().is_empty() && !email.is_empty() {
                return Some(vec![format!("{} ({})", name.trim(), email)]);
            }
        }
    }
    Some(vec![p.to_string()])
}

/// macOS: standard About ignores `authors` / `website` / `license`; `copyright` often doesn’t apply via
/// muda’s options dict — put copyright + author + URL + license here so they always show in Credits.
#[cfg(target_os = "macos")]
fn about_macos_credits(
    copyright: &Option<String>,
    publisher: &Option<String>,
    homepage: &Option<String>,
    license: &Option<String>,
) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();
    if let Some(c) = copyright {
        let t = c.trim();
        if !t.is_empty() {
            lines.push(t.to_string());
        }
    }
    if let Some(p) = publisher {
        let t = p.trim();
        if !t.is_empty() {
            lines.push(t.to_string());
        }
    }
    if let Some(h) = homepage {
        let t = h.trim();
        if !t.is_empty() {
            lines.push(t.to_string());
        }
    }
    if let Some(l) = license {
        let t = l.trim();
        if !t.is_empty() {
            lines.push(format!("License: {}", t));
        }
    }
    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

/// Native OS menu (macOS/Linux and non-Windows). On Windows we use in-app Fluent menus instead.
#[cfg(not(windows))]
fn refresh_native_menu(app: &tauri::AppHandle, state: &Arc<AppState>) {
    if let Ok(menu) = build_app_menu(app, state) {
        let _ = app.set_menu(menu);
    }
}

#[cfg(windows)]
fn refresh_native_menu(_app: &tauri::AppHandle, _state: &Arc<AppState>) {}

#[cfg(not(windows))]
fn build_app_menu(handle: &tauri::AppHandle, state: &AppState) -> tauri::Result<Menu<tauri::Wry>> {
    let file_submenu = build_file_submenu(handle, state)?;

    let view_enabled = state
        .view_columns_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let location_enabled = state
        .location_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let first_four_item =
        MenuItemBuilder::with_id("view-first-4-columns", "First 4 Columns").enabled(view_enabled).build(handle)?;
    let all_columns_item =
        MenuItemBuilder::with_id("view-all-columns", "All Columns").enabled(view_enabled).build(handle)?;
    let select_columns_item =
        MenuItemBuilder::with_id("view-select-columns", "Select Columns…").enabled(view_enabled).build(handle)?;
    let map_trace_item =
        MenuItemBuilder::with_id("view-map-trace", "Map Trace").enabled(location_enabled).build(handle)?;

    let view_submenu = SubmenuBuilder::with_id(handle, "view", "View")
        .item(&first_four_item)
        .item(&all_columns_item)
        .item(&select_columns_item)
        .separator()
        .item(&map_trace_item)
        .build()?;

    let app_name = handle
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| handle.package_info().name.clone());
    let about_item_text = format!("About {}", app_name);

    if cfg!(target_os = "macos") {
        let app_submenu = SubmenuBuilder::with_id(handle, "app", &app_name)
            .about_with_text(&about_item_text, Some(about_metadata(handle)))
            .separator()
            .quit_with_text(format!("Quit {}", app_name))
            .build()?;
        MenuBuilder::new(handle)
            .item(&app_submenu)
            .item(&file_submenu)
            .item(&view_submenu)
            .build()
    } else {
        let help_submenu = SubmenuBuilder::with_id(handle, "help", "&Help")
            .about_with_text(&about_item_text, Some(about_metadata(handle)))
            .build()?;
        MenuBuilder::new(handle)
            .item(&file_submenu)
            .item(&view_submenu)
            .item(&help_submenu)
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
    refresh_native_menu(&app, &*state);
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
    refresh_native_menu(&app, &*state);
    Ok(())
}

#[tauri::command]
fn set_location_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .location_enabled
        .write()
        .map(|mut g| *g = enabled)
        .map_err(|e| e.to_string())?;
    refresh_native_menu(&app, &*state);
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
    refresh_native_menu(&app, &*state);
    Ok(())
}

#[tauri::command]
fn get_recent_files(state: tauri::State<Arc<AppState>>) -> Vec<String> {
    state
        .recent_files
        .read()
        .map(|r| {
            r.iter()
                .take(MAX_RECENTS)
                .map(|p| p.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn request_exit(app: tauri::AppHandle) {
    app.exit(0);
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
            set_location_enabled,
            get_recent_files,
            request_exit,
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

            #[cfg(not(windows))]
            {
                let menu = build_app_menu(app.handle(), &state).map_err(|e| e.to_string())?;
                app.set_menu(menu).map_err(|e| e.to_string())?;
            }
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
                if id == "view-first-4-columns" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-first-4-columns", ());
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
