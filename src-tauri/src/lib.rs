use std::path::PathBuf;
use std::sync::Arc;
use std::sync::RwLock;
#[cfg(not(windows))]
use tauri::menu::{AboutMetadata, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

const MAX_RECENTS: usize = 10;
/// Single app store file (relative id for `tauri-plugin-store`): recents, flags, etc.
const STORE_PATH: &str = "persisted.json";
/// Pre-release store filename; migrated into [`STORE_PATH`] on first launch when needed.
const LEGACY_STORE_PATH: &str = "recents.json";
const STORE_KEY_SUPPRESS_UPGRADE: &str = "suppress_upgrade_notifications";

#[derive(Default)]
pub struct AppState {
    pub recent_files: RwLock<Vec<PathBuf>>,
    pub pending_open_files: RwLock<Vec<PathBuf>>,
    pub export_charts_enabled: RwLock<bool>,
    pub view_columns_enabled: RwLock<bool>,
    pub location_enabled: RwLock<bool>,
    pub globe_enabled: RwLock<bool>,
    pub zoom_slider_enabled: RwLock<bool>,
    pub map_trace_checked: RwLock<bool>,
    pub globe_trace_checked: RwLock<bool>,
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

/// Matches `bundle.copyright` in `tauri.conf.json` (embed omits `copyright` at runtime).
#[cfg(not(windows))]
const ABOUT_COPYRIGHT_FALLBACK: &str = "Copyright © 2026 John Coker";

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
    let copyright = nonempty_string(&bundle.copyright).or_else(|| {
        let c = ABOUT_COPYRIGHT_FALLBACK.trim();
        if c.is_empty() {
            None
        } else {
            Some(c.to_string())
        }
    });
    // `tauri::generate_context!` embeds `BundleConfig` without `homepage` (see tauri-utils codegen).
    // Fall back to `[package].homepage` / `CARGO_PKG_HOMEPAGE` so About panels still get the URL.
    let homepage = nonempty_string(&bundle.homepage).or_else(|| {
        let h = env!("CARGO_PKG_HOMEPAGE").trim();
        if h.is_empty() {
            None
        } else {
            Some(h.to_string())
        }
    });
    let license = nonempty_string(&bundle.license);

    let website_label = homepage.as_ref().map(|url| {
        if url.contains("github.com") {
            "GitHub".to_string()
        } else {
            "Website".to_string()
        }
    });

    #[cfg(target_os = "macos")]
    let credits = about_macos_credits(ABOUT_INTRO, &homepage, &license);
    #[cfg(not(target_os = "macos"))]
    let credits: Option<String> = None;

    // macOS ignores `comments`; fold the intro into Credits there. GTK/Win use `comments` as the blurb.
    let comments: Option<String> = if cfg!(target_os = "macos") {
        None
    } else {
        Some(ABOUT_INTRO.to_string())
    };

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

/// macOS: standard About ignores `authors` / `website` / `license` / `comments`. Copyright is passed
/// separately to AppKit; Credits are plain left-aligned text — keep them short. Use **Help → Product Site…**
/// for a proper browser link.
#[cfg(target_os = "macos")]
fn about_macos_credits(intro: &str, homepage: &Option<String>, license: &Option<String>) -> Option<String> {
    let intro = intro.trim();
    let mut detail_lines: Vec<String> = Vec::new();
    if let Some(h) = homepage {
        let t = h.trim();
        if !t.is_empty() {
            detail_lines.push(format!("Website: {}", t));
        }
    }
    if let Some(l) = license {
        let t = l.trim();
        if !t.is_empty() {
            detail_lines.push(format!("License: {}", t));
        }
    }
    let details = detail_lines.join("\n");
    match (intro.is_empty(), details.is_empty()) {
        (true, true) => None,
        (true, false) => Some(details),
        (false, true) => Some(intro.to_string()),
        (false, false) => Some(format!("{}\n\n{}", intro, details)),
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
    let zoom_slider_enabled = state
        .zoom_slider_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let location_enabled = state
        .location_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let globe_enabled = state
        .globe_enabled
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let map_trace_checked = state
        .map_trace_checked
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let globe_trace_checked = state
        .globe_trace_checked
        .read()
        .map(|g| *g)
        .unwrap_or(false);
    let first_four_item =
        MenuItemBuilder::with_id("view-first-4-columns", "First 4 Columns").enabled(view_enabled).build(handle)?;
    let all_columns_item =
        MenuItemBuilder::with_id("view-all-columns", "All Columns").enabled(view_enabled).build(handle)?;
    let select_columns_item =
        MenuItemBuilder::with_id("view-select-columns", "Select Columns…").enabled(view_enabled).build(handle)?;
    let zoom_slider_item =
        CheckMenuItemBuilder::with_id("view-zoom-slider", "Zoom Slider")
            .enabled(view_enabled)
            .checked(zoom_slider_enabled)
            .build(handle)?;
    let map_trace_item = CheckMenuItemBuilder::with_id("view-map-trace", "Map Trace")
        .enabled(location_enabled)
        .checked(map_trace_checked)
        .build(handle)?;
    let globe_trace_item = CheckMenuItemBuilder::with_id("view-globe-trace", "Globe Trace")
        .enabled(globe_enabled)
        .checked(globe_trace_checked)
        .build(handle)?;

    let view_submenu = SubmenuBuilder::with_id(handle, "view", "View")
        .item(&first_four_item)
        .item(&all_columns_item)
        .item(&select_columns_item)
        .separator()
        .item(&map_trace_item)
        .item(&globe_trace_item)
        .separator()
        .item(&zoom_slider_item)
        .build()?;

    let app_name = handle
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| handle.package_info().name.clone());
    let about_item_text = format!("About {}", app_name);
    let about_meta = about_metadata(handle);
    let help_site_item = MenuItemBuilder::with_id("help-product-site", "Product Site…").build(handle)?;
    let help_check_version_item =
        MenuItemBuilder::with_id("help-check-new-version", "Check for Updates…").build(handle)?;

    if cfg!(target_os = "macos") {
        let app_submenu = SubmenuBuilder::with_id(handle, "app", &app_name)
            .about_with_text(&about_item_text, Some(about_meta.clone()))
            .separator()
            .quit_with_text(format!("Quit {}", app_name))
            .build()?;
        let help_submenu = SubmenuBuilder::with_id(handle, "help", "Help")
            .item(&help_site_item)
            .item(&help_check_version_item)
            .build()?;
        MenuBuilder::new(handle)
            .item(&app_submenu)
            .item(&file_submenu)
            .item(&view_submenu)
            .item(&help_submenu)
            .build()
    } else {
        let help_submenu = SubmenuBuilder::with_id(handle, "help", "&Help")
            .item(&help_site_item)
            .item(&help_check_version_item)
            .separator()
            .about_with_text(&about_item_text, Some(about_meta))
            .build()?;
        MenuBuilder::new(handle)
            .item(&file_submenu)
            .item(&view_submenu)
            .item(&help_submenu)
            .build()
    }
}

/// One-time copy from [`LEGACY_STORE_PATH`] when [`STORE_PATH`] has no `recents` key yet.
fn migrate_legacy_store_to_persisted(app: &tauri::AppHandle) {
    let Ok(store) = app.store(STORE_PATH) else {
        return;
    };
    if store.get("recents").is_some() {
        return;
    }
    let Ok(legacy) = app.store(LEGACY_STORE_PATH) else {
        return;
    };
    let mut touched = false;
    if let Some(v) = legacy.get("recents") {
        let _ = store.set("recents".to_string(), v.clone());
        touched = true;
    }
    if let Some(v) = legacy.get(STORE_KEY_SUPPRESS_UPGRADE) {
        let _ = store.set(STORE_KEY_SUPPRESS_UPGRADE.to_string(), v.clone());
        touched = true;
    }
    if touched {
        let _ = store.save();
    }
}

fn load_recents_from_store(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let store = match app.store(STORE_PATH) {
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
    let store = app.store(STORE_PATH)?;
    let arr: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    store.set("recents".to_string(), serde_json::to_value(arr).unwrap_or_default());
    store.save()
}

fn load_suppress_upgrade_notifications(app: &tauri::AppHandle) -> bool {
    let store = match app.store(STORE_PATH) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let Some(value) = store.get(STORE_KEY_SUPPRESS_UPGRADE) else {
        return false;
    };
    serde_json::from_value::<bool>(value.clone()).unwrap_or(false)
}

fn save_suppress_upgrade_notifications(
    app: &tauri::AppHandle,
    suppressed: bool,
) -> Result<(), tauri_plugin_store::Error> {
    let store = app.store(STORE_PATH)?;
    store.set(
        STORE_KEY_SUPPRESS_UPGRADE.to_string(),
        serde_json::Value::Bool(suppressed),
    );
    store.save()
}

#[tauri::command]
fn get_suppress_upgrade_notifications(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(load_suppress_upgrade_notifications(&app))
}

#[tauri::command]
fn set_suppress_upgrade_notifications(app: tauri::AppHandle, suppressed: bool) -> Result<(), String> {
    save_suppress_upgrade_notifications(&app, suppressed).map_err(|e| e.to_string())
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
fn set_globe_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .globe_enabled
        .write()
        .map(|mut g| *g = enabled)
        .map_err(|e| e.to_string())?;
    refresh_native_menu(&app, &*state);
    Ok(())
}

#[tauri::command]
fn set_map_trace_checked(
    checked: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .map_trace_checked
        .write()
        .map(|mut g| *g = checked)
        .map_err(|e| e.to_string())?;
    refresh_native_menu(&app, &*state);
    Ok(())
}

#[tauri::command]
fn set_globe_trace_checked(
    checked: bool,
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> Result<(), String> {
    state
        .globe_trace_checked
        .write()
        .map(|mut g| *g = checked)
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
            set_globe_enabled,
            set_map_trace_checked,
            set_globe_trace_checked,
            get_recent_files,
            get_suppress_upgrade_notifications,
            set_suppress_upgrade_notifications,
            request_exit,
        ])
        .setup(move |app| {
            migrate_legacy_store_to_persisted(app.handle());
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
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        if let Ok(mut g) = state.map_trace_checked.write() {
                            *g = !*g;
                        }
                        refresh_native_menu(&app_handle, &state);
                    }
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-map-trace", ());
                    }
                    return;
                }
                if id == "view-globe-trace" {
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        if let Ok(mut g) = state.globe_trace_checked.write() {
                            *g = !*g;
                        }
                        refresh_native_menu(&app_handle, &state);
                    }
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-globe-trace", ());
                    }
                    return;
                }
                if id == "view-zoom-slider" {
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        if let Ok(mut g) = state.zoom_slider_enabled.write() {
                            *g = !*g;
                        }
                        refresh_native_menu(&app_handle, &state);
                    }
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("view-toggle-zoom-slider", ());
                    }
                    return;
                }
                if id == "help-product-site" {
                    let url = env!("CARGO_PKG_HOMEPAGE").trim();
                    if !url.is_empty() {
                        let _ = app_handle.opener().open_url(url, None::<&str>);
                    }
                    return;
                }
                if id == "help-check-new-version" {
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.emit("check-for-new-version", ());
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
