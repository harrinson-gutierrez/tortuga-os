//! Spawn y gestión del proceso sidecar Node.
//!
//! En `dev` (cargo run con beforeDevCommand de Tauri), Tauri hereda el cwd
//! del monorepo. Aquí spawneamos `node` apuntando al bundle ya construido.
//! En `bundled release`, el bundle vive como resource del .exe; aún por
//! cablear (F1.5).

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Manager;
use uuid::Uuid;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Estado compartido: PID del sidecar, puerto en el que escucha y el token de
/// handshake que el web debe enviar en cada request.
#[derive(Default)]
pub struct SidecarState {
    pub child: Mutex<Option<Child>>,
    pub port: Mutex<u16>,
    /// Token UUID v4 generado al arranque y compartido con el sidecar via env.
    /// El web lo lee con el comando Tauri `get_sidecar_token` y lo envía en
    /// cada HTTP request en el header `X-Tortuga-Secret`.
    pub token: Mutex<String>,
}

/// Comando Tauri que la WebView invoca para conocer el puerto del sidecar.
#[tauri::command]
pub fn get_sidecar_port(state: tauri::State<'_, Arc<SidecarState>>) -> u16 {
    *state.port.lock().unwrap()
}

/// Comando Tauri que la WebView invoca para conocer el token de handshake
/// que debe usar al hablarle al sidecar.
#[tauri::command]
pub fn get_sidecar_token(state: tauri::State<'_, Arc<SidecarState>>) -> String {
    state.token.lock().unwrap().clone()
}

/// Resuelve la ruta al `sidecar.cjs` empaquetado, según el modo de ejecución.
///
/// Casos cubiertos:
///   1. Bundled release/debug (instalador): <resource_dir>/dist-bundle/sidecar.cjs
///      (donde `resource_dir` es el dir del .exe instalado, e.g. Program Files).
///   2. `cargo run` o `pnpm tauri dev`: cwd típico es `apps/desktop/src-tauri/`
///      → sube 2 niveles para llegar a `apps/sidecar/dist-bundle/sidecar.cjs`.
///   3. **Doble-click en `target/debug/tortuga-os.exe`** (cwd = ese mismo dir):
///      necesita subir 5 niveles para llegar al repo, luego bajar a sidecar.
///
/// OJO: NO canonicalizar paths con `\\?\` en Windows — confunde a Node y termina
/// interpretando 'E:' como path inválido. Usamos `normalize_path` propio.
fn resolve_sidecar_cjs(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. resource_dir (bundled installer)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("dist-bundle/sidecar.cjs");
        if bundled.exists() {
            return Ok(bundled);
        }
    }

    // 2. cwd-relative (cargo run, tauri dev)
    let mut tried: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        let candidates = [
            cwd.join("../../sidecar/dist-bundle/sidecar.cjs"), // apps/desktop/src-tauri/
            cwd.join("../sidecar/dist-bundle/sidecar.cjs"),    // apps/desktop/
            cwd.join("apps/sidecar/dist-bundle/sidecar.cjs"),  // repo root
        ];
        for c in candidates {
            tried.push(c.clone());
            if c.exists() {
                return Ok(normalize_path(&c));
            }
        }
    }

    // 3. Exe-relative: si ejecutaste `target/debug/tortuga-os.exe` directo, su
    //    parent es `target/debug/`. Para llegar al repo subimos 5 niveles:
    //    target/debug → target → src-tauri → desktop → apps → repo → apps/sidecar
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidates = [
                // target/debug → 5 niveles arriba → repo → apps/sidecar/dist-bundle
                exe_dir.join("../../../../../apps/sidecar/dist-bundle/sidecar.cjs"),
                // target/release → idem
                exe_dir.join("../../../../apps/sidecar/dist-bundle/sidecar.cjs"),
                // junto al .exe (dev edge case)
                exe_dir.join("dist-bundle/sidecar.cjs"),
                exe_dir.join("../dist-bundle/sidecar.cjs"),
            ];
            for c in candidates {
                tried.push(c.clone());
                if c.exists() {
                    return Ok(normalize_path(&c));
                }
            }
        }
    }

    let tried_str = tried
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "No encontré dist-bundle/sidecar.cjs. Corre `pnpm --filter @tortuga/sidecar build` primero. Buscado en: {}",
        tried_str
    ))
}

/// Resuelve `..` / `.` en un path SIN agregar el prefijo `\\?\` que canonicalize
/// añade en Windows y que rompe a Node.
fn normalize_path(p: &PathBuf) -> PathBuf {
    let mut out = PathBuf::new();
    for component in p.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Resuelve dataDir para inyectar al sidecar como env var.
///
/// En debug builds (cargo run / tauri dev), usamos `tortuga-os/data/dev/`
/// del repo para que Tauri y el dev del browser compartan la misma DB y los
/// proyectos creados desde una vía aparezcan en la otra. En release usamos
/// `%APPDATA%\co.tortuga.os\` como destino normal de la app instalada.
fn resolve_data_dir(app: &tauri::AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        // tauri dev: cwd suele ser apps/desktop/src-tauri/. Subimos al root.
        if let Ok(cwd) = std::env::current_dir() {
            let candidates = [
                cwd.join("../../../data/dev"),  // src-tauri → desktop → apps → root
                cwd.join("../../data/dev"),     // desktop → apps → root
                cwd.join("data/dev"),           // root
            ];
            for c in candidates {
                let normalized = normalize_path(&c);
                if normalized.exists() {
                    log::info!("Using dev data dir: {}", normalized.display());
                    return normalized;
                }
            }
        }
        // doble-click sobre el .exe (target/debug/): subimos a repo.
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let candidates = [
                    exe_dir.join("../../../../../data/dev"),
                    exe_dir.join("../../../../data/dev"),
                ];
                for c in candidates {
                    let normalized = normalize_path(&c);
                    if normalized.exists() {
                        log::info!("Using dev data dir (exe-relative): {}", normalized.display());
                        return normalized;
                    }
                }
            }
        }
        log::warn!("debug build: data/dev not found, falling back to app_data_dir");
    }
    if let Ok(d) = app.path().app_data_dir() {
        return d;
    }
    PathBuf::from(".")
}

/// Spawna el sidecar y captura su stdout para extraer el puerto.
pub fn spawn_sidecar(app: &tauri::AppHandle, state: Arc<SidecarState>) -> Result<(), String> {
    let cjs = resolve_sidecar_cjs(app)?;
    let data_dir = resolve_data_dir(app);
    std::fs::create_dir_all(&data_dir).ok();

    // Generar el handshake token de esta sesión y guardarlo en el state.
    let token = Uuid::new_v4().to_string();
    *state.token.lock().unwrap() = token.clone();

    log::info!("Spawning sidecar: node {}", cjs.display());

    // NODE_ENV siempre es 'production' para el sidecar embebido: el bundle
    // empacado por esbuild no incluye el worker de pino-pretty, así que si
    // pino ve `NODE_ENV=development` activa pretty-printing y crashea con
    // `Cannot find module .../lib/worker.js`.
    //
    // Para que el sidecar afloje CORS en `tauri dev` (la WebView carga desde
    // http://127.0.0.1:5173 y el origin no es tauri.localhost), usamos una
    // env var dedicada: `TORTUGA_DESKTOP_DEV=1` SOLO en debug builds.
    let mut cmd = Command::new("node");
    cmd.arg(&cjs)
        .env("NODE_ENV", "production")
        .env("PORT", "0") // 0 = puerto random
        .env("TORTUGA_DATA_DIR", &data_dir)
        .env("TORTUGA_HANDSHAKE_TOKEN", &token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if cfg!(debug_assertions) {
        cmd.env("TORTUGA_DESKTOP_DEV", "1");
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Capturar stdout en un thread y buscar la línea TORTUGA_SIDECAR_PORT=NNNN
    let stdout = child.stdout.take().expect("stdout piped");
    let state_for_thread = state.clone();
    thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            // Buscar la línea machine-readable que el sidecar imprime
            if let Some(rest) = line.strip_prefix("TORTUGA_SIDECAR_PORT=") {
                if let Ok(p) = rest.trim().parse::<u16>() {
                    log::info!("Sidecar listening on port {}", p);
                    *state_for_thread.port.lock().unwrap() = p;
                }
            } else {
                // El resto es JSON de pino — log directo
                log::debug!("[sidecar] {}", line);
            }
        }
    });

    // Capturar stderr a logs (informativo)
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                log::warn!("[sidecar:stderr] {}", line);
            }
        });
    }

    *state.child.lock().unwrap() = Some(child);
    Ok(())
}

/// Mata el sidecar (al cerrar la app).
///
/// `child.kill()` solo mata el PID padre; en dev el sidecar es un árbol
/// (node → tsx watch → ...) y los hijos quedan huérfanos manteniendo cargado
/// `better_sqlite3.node`, que en Windows bloquea el siguiente build con EPERM.
/// Matamos el árbol completo por PID antes de hacer el kill/wait normal.
pub fn kill_sidecar(state: &SidecarState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            kill_process_tree(child.id());
            let _ = child.kill();
            let _ = child.wait();
            log::info!("Sidecar process tree killed");
        }
    }
}

/// Mata el proceso `pid` y todos sus descendientes.
#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    if let Err(e) = cmd.status() {
        log::warn!("taskkill on sidecar tree (pid {}) failed: {}", pid, e);
    }
}

/// Mata el grupo de procesos liderado por `pid`.
#[cfg(not(windows))]
fn kill_process_tree(pid: u32) {
    let _ = Command::new("pkill").args(["-TERM", "-P", &pid.to_string()]).status();
}
