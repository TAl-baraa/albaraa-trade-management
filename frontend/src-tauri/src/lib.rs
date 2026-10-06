mod commands;
mod database;

use std::{sync::Arc, thread, time::Duration};
use tauri::Manager;

const AUTOMATIC_BACKUP_CHECK_INTERVAL: Duration = Duration::from_secs(10 * 60);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth_status,
            commands::create_first_user,
            commands::verify_login,
            commands::change_password,
            commands::get_backup_settings,
            commands::configure_backup_directory,
            commands::create_manual_backup,
            commands::restore_database_backup,
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
            commands::list_sales,
            commands::list_sales_by_business_date,
            commands::get_sale,
            commands::create_sale,
            commands::update_sale,
            commands::soft_delete_sale,
            commands::toggle_sale_reviewed,
            commands::list_receipts,
            commands::list_receipts_by_business_date,
            commands::get_receipt,
            commands::create_receipt,
            commands::update_receipt,
            commands::soft_delete_receipt
        ])
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            database::initialize(&directory)?;
            let backup_lock = Arc::new(database::backup::BackupOperationLock::new(()));
            app.manage(commands::DatabaseDirectory {
                path: directory.clone(),
                backup_lock: backup_lock.clone(),
            });
            let scheduler_directory = directory.clone();
            thread::Builder::new()
                .name("automatic-backup-scheduler".into())
                .spawn(move || {
                    loop {
                        if let Err(error) = database::backup::run_automatic_if_due(
                            &scheduler_directory,
                            &backup_lock,
                        ) {
                            eprintln!("Automatic backup check failed: {error}");
                        }
                        thread::sleep(AUTOMATIC_BACKUP_CHECK_INTERVAL);
                    }
                })?;
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
