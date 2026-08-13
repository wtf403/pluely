use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct AppState {
    pub opacity: Mutex<f64>,           // 0.0 – 1.0
    pub toggle_shortcut: Mutex<String>, // e.g. "CommandOrControl+Shift+Space"
    pub expand_shortcut: Mutex<String>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            opacity: Mutex::new(0.92),
            toggle_shortcut: Mutex::new("CommandOrControl+Shift+Space".into()),
            expand_shortcut: Mutex::new("CommandOrControl+Shift+E".into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_opacity(state: tauri::State<AppState>) -> f64 {
    *state.opacity.lock().unwrap()
}

#[tauri::command]
fn set_opacity(state: tauri::State<AppState>, value: f64) {
    let clamped = value.clamp(0.1, 1.0);
    *state.opacity.lock().unwrap() = clamped;
}

#[tauri::command]
fn get_toggle_shortcut(state: tauri::State<AppState>) -> String {
    state.toggle_shortcut.lock().unwrap().clone()
}

#[tauri::command]
fn get_expand_shortcut(state: tauri::State<AppState>) -> String {
    state.expand_shortcut.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_window(app: AppHandle) {
    do_toggle(&app);
}

#[tauri::command]
fn set_window_expanded(app: AppHandle, expanded: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let height: f64 = if expanded { 420.0 } else { 56.0 };
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 640.0,
            height,
        }));
    }
}

#[tauri::command]
fn update_shortcut(
    app: AppHandle,
    state: tauri::State<AppState>,
    action: String,
    shortcut: String,
) -> Result<(), String> {
    match action.as_str() {
        "toggle" => {
            // Unregister old
            let old = state.toggle_shortcut.lock().unwrap().clone();
            if let Ok(sc) = old.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(sc);
            }
            // Register new
            register_toggle_shortcut(&app, &shortcut)?;
            *state.toggle_shortcut.lock().unwrap() = shortcut;
        }
        "expand" => {
            let old = state.expand_shortcut.lock().unwrap().clone();
            if let Ok(sc) = old.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(sc);
            }
            register_expand_shortcut(&app, &shortcut)?;
            *state.expand_shortcut.lock().unwrap() = shortcut;
        }
        _ => return Err(format!("Unknown action: {}", action)),
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Shortcut helpers
// ---------------------------------------------------------------------------

fn do_toggle(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    }
}

fn do_expand(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(size) = win.inner_size() {
            let expanded = size.height < 200;
            let height: f64 = if expanded { 420.0 } else { 56.0 };
            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: 640.0,
                height,
            }));
        }
    }
}

fn register_toggle_shortcut(app: &AppHandle, shortcut_str: &str) -> Result<(), String> {
    let sc: Shortcut = shortcut_str
        .parse()
        .map_err(|_| format!("Invalid shortcut: {}", shortcut_str))?;
    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                do_toggle(&app_clone);
            }
        })
        .map_err(|e| e.to_string())
}

fn register_expand_shortcut(app: &AppHandle, shortcut_str: &str) -> Result<(), String> {
    let sc: Shortcut = shortcut_str
        .parse()
        .map_err(|_| format!("Invalid shortcut: {}", shortcut_str))?;
    let app_clone = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                do_expand(&app_clone);
            }
        })
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// macOS NSPanel setup (makes window ignore app-switcher + proctoring)
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn setup_nspanel(window: &WebviewWindow) {
    use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;

    let panel = window.to_panel().expect("failed to convert to NSPanel");

    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle,
    );

    // Level 25 = floating panel above everything including full-screen apps
    panel.set_level(25);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_opacity,
            set_opacity,
            get_toggle_shortcut,
            get_expand_shortcut,
            toggle_window,
            set_window_expanded,
            update_shortcut,
        ]);

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();

            // Register default shortcuts
            let toggle_sc = app
                .state::<AppState>()
                .toggle_shortcut
                .lock()
                .unwrap()
                .clone();
            let expand_sc = app
                .state::<AppState>()
                .expand_shortcut
                .lock()
                .unwrap()
                .clone();

            if let Err(e) = register_toggle_shortcut(&handle, &toggle_sc) {
                eprintln!("Failed to register toggle shortcut: {}", e);
            }
            if let Err(e) = register_expand_shortcut(&handle, &expand_sc) {
                eprintln!("Failed to register expand shortcut: {}", e);
            }

            // macOS: convert main window to NSPanel
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                setup_nspanel(&win);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running overlaynote");
}
