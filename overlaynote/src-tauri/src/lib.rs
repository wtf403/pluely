use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tokio::time::{sleep, Duration};

#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct AppState {
    pub opacity: Mutex<f64>,
    pub toggle_shortcut: Mutex<String>,
    pub expand_shortcut: Mutex<String>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            opacity: Mutex::new(0.92),
            toggle_shortcut: Mutex::new("Alt+Backslash".into()),
            expand_shortcut: Mutex::new("CommandOrControl+Shift+E".into()),
        }
    }
}

/// Tracks smooth arrow-key movement tasks per direction
pub type MoveTask = Arc<AtomicBool>;

pub struct MoveState {
    tasks: Mutex<HashMap<String, MoveTask>>,
}

impl Default for MoveState {
    fn default() -> Self {
        MoveState {
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

/// All registered shortcut keys keyed by action id
pub struct RegisteredShortcuts {
    pub shortcuts: Mutex<HashMap<String, String>>,
}

impl Default for RegisteredShortcuts {
    fn default() -> Self {
        RegisteredShortcuts {
            shortcuts: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_opacity(state: tauri::State<AppState>) -> f64 {
    *state.opacity.lock().unwrap()
}

#[tauri::command]
pub fn set_opacity(state: tauri::State<AppState>, value: f64) {
    *state.opacity.lock().unwrap() = value.clamp(0.1, 1.0);
}

#[tauri::command]
pub fn get_toggle_shortcut(state: tauri::State<AppState>) -> String {
    state.toggle_shortcut.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_expand_shortcut(state: tauri::State<AppState>) -> String {
    state.expand_shortcut.lock().unwrap().clone()
}

#[tauri::command]
pub fn toggle_window(app: AppHandle) {
    do_toggle(&app);
}

#[tauri::command]
pub fn set_window_expanded(app: AppHandle, expanded: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let height: f64 = if expanded { 420.0 } else { 56.0 };
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 640.0,
            height,
        }));
    }
}

#[tauri::command]
pub fn move_window(app: AppHandle, direction: String, step: i32) -> Result<(), String> {
    do_move_window(&app, &direction, step);
    Ok(())
}

#[tauri::command]
pub fn update_shortcut(
    app: AppHandle,
    state: tauri::State<AppState>,
    registered: tauri::State<RegisteredShortcuts>,
    action: String,
    shortcut: String,
) -> Result<(), String> {
    // Unregister old binding for this action
    {
        let mut reg = registered.shortcuts.lock().unwrap();
        if let Some(old) = reg.get(&action) {
            if let Ok(sc) = old.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(sc);
            }
        }
        reg.insert(action.clone(), shortcut.clone());
    }

    // Register new
    match action.as_str() {
        "toggle" => {
            register_toggle(&app, &shortcut)?;
            *state.toggle_shortcut.lock().unwrap() = shortcut;
        }
        "expand" => {
            register_expand(&app, &shortcut)?;
            *state.expand_shortcut.lock().unwrap() = shortcut;
        }
        _ => return Err(format!("Unknown action: {}", action)),
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Window movement helpers
// ---------------------------------------------------------------------------

fn do_move_window(app: &AppHandle, direction: &str, step: i32) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(pos) = win.outer_position() {
            let (x, y) = match direction {
                "up"    => (pos.x, pos.y - step),
                "down"  => (pos.x, pos.y + step),
                "left"  => (pos.x - step, pos.y),
                "right" => (pos.x + step, pos.y),
                _ => return,
            };
            let _ = win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x, y },
            ));
        }
    }
}

pub fn start_move(app: &AppHandle, direction: &str) {
    let state = app.state::<MoveState>();
    let mut tasks = state.tasks.lock().unwrap();
    if tasks.contains_key(direction) {
        return;
    }
    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();
    let dir = direction.to_string();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while !stop_clone.load(Ordering::Relaxed) {
            do_move_window(&handle, &dir, 12);
            sleep(Duration::from_millis(16)).await;
        }
    });
    tasks.insert(direction.to_string(), stop);
}

pub fn stop_move(app: &AppHandle, direction: &str) {
    let state = app.state::<MoveState>();
    let mut tasks = state.tasks.lock().unwrap();
    if let Some(flag) = tasks.remove(direction) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn stop_all_moves(app: &AppHandle) {
    let state = app.state::<MoveState>();
    let mut tasks = state.tasks.lock().unwrap();
    for (_, flag) in tasks.drain() {
        flag.store(true, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// Toggle helper
// ---------------------------------------------------------------------------

fn do_toggle(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };

    match win.is_visible() {
        Ok(true) => {
            let _ = win.hide();
        }
        _ => {
            let _ = win.show();
            let _ = win.set_focus();
            let _ = win.emit("focus-input", ());
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

// ---------------------------------------------------------------------------
// Shortcut registration
// ---------------------------------------------------------------------------

fn register_toggle(app: &AppHandle, key: &str) -> Result<(), String> {
    let sc: Shortcut = key.parse().map_err(|_| format!("Invalid shortcut: {}", key))?;
    let h = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_, _, ev| {
            if ev.state == ShortcutState::Pressed {
                do_toggle(&h);
            }
        })
        .map_err(|e| e.to_string())
}

fn register_expand(app: &AppHandle, key: &str) -> Result<(), String> {
    let sc: Shortcut = key.parse().map_err(|_| format!("Invalid shortcut: {}", key))?;
    let h = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_, _, ev| {
            if ev.state == ShortcutState::Pressed {
                do_expand(&h);
            }
        })
        .map_err(|e| e.to_string())
}

fn register_move_arrows(app: &AppHandle, modifier: &str) -> Result<(), String> {
    for dir in ["up", "down", "left", "right"] {
        let combo = format!("{}+{}", modifier, dir);
        let sc: Shortcut = combo.parse().map_err(|_| format!("Invalid shortcut: {}", combo))?;
        let h = app.clone();
        let dir_owned = dir.to_string();
        app.global_shortcut()
            .on_shortcut(sc, move |_, _, ev| match ev.state {
                ShortcutState::Pressed  => start_move(&h, &dir_owned),
                ShortcutState::Released => stop_move(&h, &dir_owned),
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// macOS NSPanel
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn setup_nspanel(win: &tauri::WebviewWindow) {
    use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
    if let Ok(panel) = win.to_panel() {
        #[allow(deprecated)]
        panel.set_collection_behaviour(
            NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle,
        );
        panel.set_level(25);
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState::default())
        .manage(MoveState::default())
        .manage(RegisteredShortcuts::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_opacity,
            set_opacity,
            get_toggle_shortcut,
            get_expand_shortcut,
            toggle_window,
            set_window_expanded,
            move_window,
            update_shortcut,
        ]);

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();

            // Default shortcuts
            // Alt+\ → toggle (hide/show)
            if let Err(e) = register_toggle(&handle, "Alt+Backslash") {
                eprintln!("toggle shortcut: {}", e);
            }
            // Ctrl/Cmd+Shift+E → expand
            if let Err(e) = register_expand(&handle, "CommandOrControl+Shift+E") {
                eprintln!("expand shortcut: {}", e);
            }
            // Alt+Arrow → move window
            if let Err(e) = register_move_arrows(&handle, "Alt") {
                eprintln!("move shortcuts: {}", e);
            }

            // macOS NSPanel
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                setup_nspanel(&win);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running overlaynote");
}
