use std::sync::Mutex;
use tauri::{Manager, RunEvent, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

const READY_PREFIX: &str = "JOTTAPP_READY ";

struct SidecarChild(Mutex<Option<CommandChild>>);

fn configure_window<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    let builder = builder
        .title("jott")
        .inner_size(1280.0, 860.0)
        .min_inner_size(900.0, 600.0)
        .resizable(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 20.0));

    builder
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarChild(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                // dev: `bun run dev` (via beforeDevCommand) runs vite + backend.
                // Window points at devUrl from tauri.conf.json; the sidecar isn't built yet.
                configure_window(WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App("/".into()),
                ))
                .build()?;
                return Ok(());
            }

            let app_data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).ok();

            let sidecar = app
                .shell()
                .sidecar("jottapp-backend")
                .unwrap()
                .env("JOTT_BUNDLED", "true")
                .env("JOTT_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                .env("JOTTAPP_PORT", "0");

            let (mut rx, child) = sidecar.spawn().expect("failed to spawn sidecar");
            app.state::<SidecarChild>().0.lock().unwrap().replace(child);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut window_built = false;
                while let Some(event) = rx.recv().await {
                    let CommandEvent::Stdout(bytes) = event else { continue };
                    let line = String::from_utf8_lossy(&bytes);
                    let line = line.trim_end_matches(['\r', '\n']);
                    println!("[hono] {}", line);

                    if window_built {
                        continue;
                    }
                    let Some(url) = parse_ready_url(line) else { continue };
                    let parsed = match tauri::Url::parse(url) {
                        Ok(u) => u,
                        Err(e) => {
                            eprintln!("failed to parse hono url {url:?}: {e}");
                            continue;
                        }
                    };
                    if let Err(e) = configure_window(WebviewWindowBuilder::new(
                        &handle,
                        "main",
                        WebviewUrl::External(parsed),
                    ))
                    .build()
                    {
                        eprintln!("failed to build main window: {e}");
                        continue;
                    }
                    window_built = true;
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building app")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<SidecarChild>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}

fn parse_ready_url(line: &str) -> Option<&str> {
    line.strip_prefix(READY_PREFIX).map(str::trim)
}
