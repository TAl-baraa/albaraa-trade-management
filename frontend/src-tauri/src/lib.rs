mod database;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            database::initialize(&directory)?;
            #[cfg(debug_assertions)]
            eprintln!(
                "SQLite initialized: {}",
                directory.join("albaraa.db").display()
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("تعذر تشغيل التطبيق");
}
