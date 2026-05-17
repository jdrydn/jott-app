use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

const READY_PREFIX: &str = "JOTTAPP_READY ";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                // dev: `bun run dev` (via beforeDevCommand) runs vite + backend.
                // Window points at devUrl from tauri.conf.json; the sidecar isn't built yet.
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
                    .title("jott")
                    .inner_size(1000.0, 800.0)
                    .resizable(true)
                    .build()?;
                return Ok(());
            }

            let app_data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).ok();

            let sidecar = app
                .shell()
                .sidecar("hono-server")
                .unwrap()
                .env("JOTT_BUNDLED", "true")
                .env("JOTT_DATA_DIR", app_data_dir.to_string_lossy().to_string())
                .env("JOTTAPP_PORT", "0");

            let (mut rx, _child) = sidecar.spawn().expect("failed to spawn sidecar");

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
                    if let Err(e) =
                        WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(parsed))
                            .title("jott")
                            .inner_size(1000.0, 800.0)
                            .resizable(true)
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
        .run(tauri::generate_context!())
        .expect("error running app");
}

fn parse_ready_url(line: &str) -> Option<&str> {
    line.strip_prefix(READY_PREFIX).map(str::trim)
}
