/// The desktop and mobile shell: one window showing the web app, plus the system file dialogs and file access
/// it needs to open and save circuits on disk. All simulation runs in the web app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_fs::init())
		.run(tauri::generate_context!())
		.expect("error while running Sparkbench");
}
