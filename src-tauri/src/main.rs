#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, File},
    io::Read,
    path::Path,
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const LAYOUT_LIMIT: usize = 2_000_000;
const PROMPT_LIMIT: usize = LAYOUT_LIMIT * 2;
type CommandResult<T> = Result<T, String>;

fn within_limit(length: usize, limit: usize) -> CommandResult<()> {
    if length > limit {
        return Err("fileTooLarge".into());
    }
    Ok(())
}

fn read_layout(path: &Path) -> CommandResult<String> {
    let mut data = Vec::new();
    File::open(path)
        .and_then(|file| file.take((LAYOUT_LIMIT + 1) as u64).read_to_end(&mut data))
        .map_err(|error| error.to_string())?;
    within_limit(data.len(), LAYOUT_LIMIT)?;
    String::from_utf8(data).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_layout(window: WebviewWindow) -> CommandResult<Option<String>> {
    let selected = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Layout JSON", &["json"])
        .blocking_pick_file();
    selected
        .map(|path| read_layout(&path.into_path().map_err(|error| error.to_string())?))
        .transpose()
}

fn save_file(
    window: &WebviewWindow,
    text: &str,
    file_name: &str,
    extension: &str,
    limit: usize,
) -> CommandResult<bool> {
    within_limit(text.len(), limit)?;
    let selected = window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter(extension.to_uppercase(), &[extension])
        .set_file_name(file_name)
        .blocking_save_file();
    let Some(path) = selected else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn save_layout(window: WebviewWindow, text: String) -> CommandResult<bool> {
    save_file(&window, &text, "moss-layout.json", "json", LAYOUT_LIMIT)
}

#[tauri::command]
async fn save_prompt(window: WebviewWindow, text: String) -> CommandResult<bool> {
    save_file(&window, &text, "moss-prompt.txt", "txt", PROMPT_LIMIT)
}

#[tauri::command]
fn copy_prompt(window: WebviewWindow, text: String) -> CommandResult<()> {
    within_limit(text.len(), PROMPT_LIMIT)?;
    window.clipboard().write_text(text).map_err(|error| error.to_string())
}

#[tauri::command]
async fn confirm_resize(window: WebviewWindow, message: String) -> bool {
    window
        .dialog()
        .message(message)
        .title("MossImage Layout Editor")
        .parent(&window)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}

fn place_startup_window(window: &WebviewWindow) -> tauri::Result<()> {
    // Windows shortcuts may launch on any monitor. Use the pointer's monitor
    // while the window is hidden, then fall back to the system placement.
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|point| window.monitor_from_point(point.x, point.y).ok().flatten())
        .or(window.current_monitor()?)
        .or(window.primary_monitor()?);
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let area = monitor.work_area();
    if area.size.width == 0 || area.size.height == 0 {
        return Ok(());
    }

    // Work area and window bounds are physical pixels. Convert the defaults
    // and window decorations to the destination monitor's scale first.
    let from_scale = window.scale_factor()?;
    let scale = monitor.scale_factor();
    let inner = window.inner_size()?;
    let outer = window.outer_size()?;
    let frame_width = (f64::from(outer.width.saturating_sub(inner.width)) / from_scale * scale).ceil() as u32;
    let frame_height = (f64::from(outer.height.saturating_sub(inner.height)) / from_scale * scale).ceil() as u32;
    let room_width = area.size.width.saturating_sub(frame_width + 8).max(1);
    let room_height = area.size.height.saturating_sub(frame_height + 8).max(1);
    let config = &window.app_handle().config().app.windows[0];
    let pixels = |logical: f64| (logical * scale).round() as u32;
    let width = pixels(config.width).min(room_width);
    let height = pixels(config.height).min(room_height);

    let position = PhysicalPosition::new(
        area.position.x + (area.size.width.saturating_sub(width + frame_width) / 2) as i32,
        area.position.y + (area.size.height.saturating_sub(height + frame_height) / 2) as i32,
    );
    // Move first so Windows applies the correct DPI before setting the size.
    window.set_position(position)?;
    window.set_min_size(Some(PhysicalSize::new(
        pixels(config.min_width.unwrap_or(config.width)).min(width),
        pixels(config.min_height.unwrap_or(config.height)).min(height),
    )))?;
    window.set_size(PhysicalSize::new(width, height))?;
    window.set_position(position)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = place_startup_window(&window) {
                    eprintln!("Could not fit the startup window: {error}");
                }
                window.show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_layout,
            save_layout,
            save_prompt,
            copy_prompt,
            confirm_resize
        ])
        .run(tauri::generate_context!())
        .expect("failed to start MossImage Layout Editor");
}
