// Tortuga OS — entrypoint del shell desktop.
//
// Responsabilidades:
// - Generar un handshake token (UUID) al arrancar
// - Spawnear el sidecar Node con el token via env var
// - Capturar el puerto que el sidecar imprime en stdout
// - Exponer comandos `get_sidecar_port` y `get_sidecar_token` a la WebView
// - Matar el sidecar al cerrar la app

mod sidecar;

use std::sync::Arc;
use tauri::{Manager, UserAttentionType};

/// Flashes the Tortuga icon in the OS taskbar to grab the user's attention
/// when the window is not focused. Called from the frontend's notification
/// watcher every time a new row appears. No-op if the window is already
/// focused (the OS would ignore the call anyway).
#[tauri::command]
fn flash_taskbar(app: tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("main window missing".into())
    };
    let focused = window.is_focused().unwrap_or(false);
    if focused {
        return Ok(())
    }
    window
        .request_user_attention(Some(UserAttentionType::Informational))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_state = Arc::new(sidecar::SidecarState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar_state.clone())
        .invoke_handler(tauri::generate_handler![
            sidecar::get_sidecar_port,
            sidecar::get_sidecar_token,
            flash_taskbar
        ])
        .setup({
            let sidecar_state = sidecar_state.clone();
            move |app| {
                let app_handle = app.handle().clone();
                if let Err(e) = sidecar::spawn_sidecar(&app_handle, sidecar_state.clone()) {
                    log::error!("Failed to spawn sidecar: {}", e);
                }
                Ok(())
            }
        })
        .on_window_event({
            let sidecar_state = sidecar_state.clone();
            move |_window, event| {
                if let tauri::WindowEvent::Destroyed = event {
                    sidecar::kill_sidecar(&sidecar_state);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tortuga OS application");
}
