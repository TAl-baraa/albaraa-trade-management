mod commands;
mod database;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_customers,
            commands::get_customer,
            commands::create_customer,
            commands::update_customer,
            commands::archive_customer,
            commands::reactivate_customer,
            commands::list_products,
            commands::get_product,
            commands::create_product,
            commands::update_product,
            commands::archive_product,
            commands::reactivate_product,
            commands::delete_customer,
            commands::update_customer_balances
        ])
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            database::initialize(&directory)?;
            app.manage(commands::DatabaseDirectory(directory.clone()));
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
