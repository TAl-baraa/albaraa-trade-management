use super::{SCHEMA_VERSION, TABLES, initialize};
use crate::database::records::{NOW, RepositoryResult, database_error};
use rusqlite::{Connection, OpenFlags, OptionalExtension, backup::Backup, params};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    sync::{Mutex, TryLockError},
    time::Duration,
};

const BACKUP_DIRECTORY_KEY: &str = "backup_directory";
const LAST_BACKUP_KEY: &str = "last_successful_backup_at";
const LAST_AUTO_BACKUP_KEY: &str = "last_successful_auto_backup_at";
const LAST_AUTO_BACKUP_ERROR_KEY: &str = "last_auto_backup_error";
const AUTO_BACKUP_PREFIX: &str = "albaraa-auto-backup";
const AUTO_BACKUP_RETENTION: usize = 20;
const AUTO_BACKUP_INTERVAL_HOURS: i64 = 3;

pub type BackupOperationLock = Mutex<()>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSettings {
    pub backup_directory: Option<String>,
    pub last_successful_backup_at: Option<String>,
    pub last_successful_auto_backup_at: Option<String>,
    pub automatic_backup_available: bool,
    pub automatic_backup_count: usize,
    pub automatic_backup_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub completed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub safety_backup_path: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AutomaticBackupOutcome {
    Created,
    NotDue,
    NoDirectory,
    Busy,
}

fn setting(connection: &Connection, key: &str) -> RepositoryResult<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key=?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)
}

fn set_setting(connection: &Connection, key: &str, value: &str) -> RepositoryResult<()> {
    connection
        .execute(
            &format!("INSERT INTO app_metadata(key, value, updated_at) VALUES (?1, ?2, {NOW}) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at={NOW}"),
            params![key, value],
        )
        .map_err(database_error)?;
    Ok(())
}

fn delete_setting(connection: &Connection, key: &str) -> RepositoryResult<()> {
    connection
        .execute("DELETE FROM app_metadata WHERE key=?1", [key])
        .map_err(database_error)?;
    Ok(())
}

pub fn settings(connection: &Connection) -> RepositoryResult<BackupSettings> {
    let backup_directory = setting(connection, BACKUP_DIRECTORY_KEY)?;
    let directory_status = backup_directory
        .as_deref()
        .map(|path| validate_writable_directory(Path::new(path)));
    let automatic_backup_available = matches!(directory_status, Some(Ok(())));
    let automatic_backup_warning = match directory_status {
        Some(Err(error)) => Some(error),
        _ => setting(connection, LAST_AUTO_BACKUP_ERROR_KEY)?,
    };
    let automatic_backup_count = backup_directory
        .as_deref()
        .filter(|_| automatic_backup_available)
        .map(|path| automatic_backup_files(Path::new(path)).map(|files| files.len()))
        .transpose()?
        .unwrap_or(0);
    Ok(BackupSettings {
        backup_directory,
        last_successful_backup_at: setting(connection, LAST_BACKUP_KEY)?,
        last_successful_auto_backup_at: setting(connection, LAST_AUTO_BACKUP_KEY)?,
        automatic_backup_available,
        automatic_backup_count,
        automatic_backup_warning,
    })
}

fn validate_writable_directory(directory: &Path) -> RepositoryResult<()> {
    if !directory.is_dir() {
        return Err("مجلد النسخ الاحتياطي غير متاح. اختر مجلدًا آخر.".into());
    }
    let probe = directory.join(format!(".albaraa-write-test-{}", std::process::id()));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|_| "لا يمكن الكتابة في مجلد النسخ الاحتياطي. اختر مجلدًا آخر.".to_string())?;
    fs::remove_file(probe).map_err(|_| "تعذر التحقق من صلاحية مجلد النسخ الاحتياطي.".to_string())?;
    Ok(())
}

pub fn configure_directory(
    connection: &Connection,
    directory: &str,
) -> RepositoryResult<BackupSettings> {
    let directory = PathBuf::from(directory);
    validate_writable_directory(&directory)?;
    let canonical = directory
        .canonicalize()
        .map_err(|_| "تعذر الوصول إلى مجلد النسخ الاحتياطي. اختر مجلدًا آخر.".to_string())?;
    set_setting(
        connection,
        BACKUP_DIRECTORY_KEY,
        &canonical.to_string_lossy(),
    )?;
    delete_setting(connection, LAST_AUTO_BACKUP_ERROR_KEY)?;
    settings(connection)
}

fn database_timestamp(connection: &Connection) -> RepositoryResult<String> {
    connection
        .query_row(
            "SELECT strftime('%Y-%m-%d-%H%M%S', 'now', 'localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn iso_timestamp(connection: &Connection) -> RepositoryResult<String> {
    connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(database_error)
}

fn available_backup_path(directory: &Path, prefix: &str, timestamp: &str) -> PathBuf {
    let first = directory.join(format!("{prefix}-{timestamp}.db"));
    if !first.exists() {
        return first;
    }
    for suffix in 2.. {
        let candidate = directory.join(format!("{prefix}-{timestamp}-{suffix}.db"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn copy_database(source: &Connection, destination_path: &Path) -> RepositoryResult<()> {
    let mut destination = Connection::open(destination_path).map_err(database_error)?;
    let backup = Backup::new(source, &mut destination).map_err(database_error)?;
    backup
        .run_to_completion(32, Duration::from_millis(20), None)
        .map_err(database_error)
}

fn open_valid_database(path: &Path) -> RepositoryResult<Connection> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "ملف النسخة الاحتياطية غير صالح أو لا يمكن قراءته.".to_string())?;
    validate_database(&connection)?;
    Ok(connection)
}

fn validate_database(connection: &Connection) -> RepositoryResult<()> {
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|_| "ملف النسخة الاحتياطية تالف أو غير صالح.".to_string())?;
    if integrity != "ok" {
        return Err("ملف النسخة الاحتياطية تالف ولا يمكن استعادته.".into());
    }
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| "هذا الملف ليس نسخة احتياطية صالحة لنظام البراء.".to_string())?;
    let metadata_version: Option<String> = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key='schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "هذا الملف ليس نسخة احتياطية صالحة لنظام البراء.".to_string())?;
    if version != SCHEMA_VERSION || metadata_version.as_deref() != Some("4") {
        return Err("إصدار النسخة الاحتياطية غير مدعوم في هذا الإصدار من التطبيق.".into());
    }
    for table in TABLES {
        connection
            .prepare(&format!("SELECT * FROM {table} LIMIT 0"))
            .map_err(|_| "هذا الملف لا يحتوي على بيانات نظام البراء المطلوبة.".to_string())?;
    }
    Ok(())
}

fn create_validated_backup(
    connection: &Connection,
    directory: &Path,
    prefix: &str,
) -> RepositoryResult<(PathBuf, String)> {
    validate_writable_directory(directory)?;
    let timestamp = database_timestamp(connection)?;
    let path = available_backup_path(directory, prefix, &timestamp);
    if let Err(error) = copy_database(connection, &path) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    if let Err(error) = open_valid_database(&path) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    Ok((path, iso_timestamp(connection)?))
}

fn acquire_user_operation(
    operation_lock: &BackupOperationLock,
) -> RepositoryResult<std::sync::MutexGuard<'_, ()>> {
    match operation_lock.try_lock() {
        Ok(guard) => Ok(guard),
        Err(TryLockError::WouldBlock) => {
            Err("توجد عملية نسخ احتياطي أو استعادة قيد التنفيذ. أعد المحاولة بعد قليل.".into())
        }
        Err(TryLockError::Poisoned(_)) => {
            Err("تعذر بدء عملية النسخ الاحتياطي بأمان. أعد تشغيل التطبيق.".into())
        }
    }
}

pub fn create_manual(
    app_data_directory: &Path,
    operation_lock: &BackupOperationLock,
) -> RepositoryResult<BackupResult> {
    let _operation = acquire_user_operation(operation_lock)?;
    let connection = initialize(app_data_directory).map_err(|error| error.to_string())?;
    let configured = setting(&connection, BACKUP_DIRECTORY_KEY)?
        .ok_or_else(|| "اختر مجلد النسخ الاحتياطي أولًا.".to_string())?;
    let directory = PathBuf::from(configured);
    let (path, completed_at) = create_validated_backup(&connection, &directory, "albaraa-backup")?;
    set_setting(&connection, LAST_BACKUP_KEY, &completed_at)?;
    Ok(BackupResult {
        path: path.to_string_lossy().into_owned(),
        completed_at,
    })
}

fn automatic_backup_name(name: &str) -> bool {
    let Some(stem) = name.strip_prefix("albaraa-auto-backup-") else {
        return false;
    };
    let Some(stem) = stem.strip_suffix(".db") else {
        return false;
    };
    let bytes = stem.as_bytes();
    if bytes.len() < 17 {
        return false;
    }
    let expected_separators = [(4, b'-'), (7, b'-'), (10, b'-')];
    if expected_separators
        .iter()
        .any(|(index, value)| bytes.get(*index) != Some(value))
    {
        return false;
    }
    if bytes[..17]
        .iter()
        .enumerate()
        .any(|(index, value)| !matches!(index, 4 | 7 | 10) && !value.is_ascii_digit())
    {
        return false;
    }
    bytes.len() == 17
        || (bytes.get(17) == Some(&b'-')
            && bytes[18..].iter().all(u8::is_ascii_digit)
            && bytes.len() > 18)
}

fn automatic_backup_files(directory: &Path) -> RepositoryResult<Vec<PathBuf>> {
    let entries = fs::read_dir(directory)
        .map_err(|_| "تعذر قراءة مجلد النسخ الاحتياطي التلقائي.".to_string())?;
    let mut files = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|_| "تعذر قراءة أحد ملفات النسخ الاحتياطي التلقائي.".to_string())?;
        if entry
            .file_type()
            .map_err(|_| "تعذر فحص أحد ملفات النسخ الاحتياطي التلقائي.".to_string())?
            .is_file()
            && automatic_backup_name(&entry.file_name().to_string_lossy())
        {
            files.push(entry.path());
        }
    }
    files.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    Ok(files)
}

fn apply_automatic_retention(directory: &Path) -> RepositoryResult<()> {
    let files = automatic_backup_files(directory)?;
    let remove_count = files.len().saturating_sub(AUTO_BACKUP_RETENTION);
    for path in files.into_iter().take(remove_count) {
        fs::remove_file(path)
            .map_err(|_| "تعذر حذف نسخة تلقائية قديمة وفق سياسة الاحتفاظ.".to_string())?;
    }
    Ok(())
}

fn automatic_backup_due(connection: &Connection) -> RepositoryResult<bool> {
    let last = setting(connection, LAST_AUTO_BACKUP_KEY)?;
    match last {
        None => Ok(true),
        Some(value) => connection
            .query_row(
                "SELECT COALESCE((julianday('now') - julianday(?1)) * 24.0 >= ?2, 1)",
                params![value, AUTO_BACKUP_INTERVAL_HOURS],
                |row| row.get(0),
            )
            .map_err(database_error),
    }
}

fn record_automatic_failure(connection: &Connection, error: &str) {
    let _ = set_setting(connection, LAST_AUTO_BACKUP_ERROR_KEY, error);
}

fn finalize_automatic_backup(
    connection: &Connection,
    directory: &Path,
    path: &Path,
    completed_at: &str,
) -> RepositoryResult<()> {
    open_valid_database(path)?;
    set_setting(connection, LAST_BACKUP_KEY, completed_at)?;
    set_setting(connection, LAST_AUTO_BACKUP_KEY, completed_at)?;
    delete_setting(connection, LAST_AUTO_BACKUP_ERROR_KEY)?;
    apply_automatic_retention(directory)
}

pub fn run_automatic_if_due(
    app_data_directory: &Path,
    operation_lock: &BackupOperationLock,
) -> RepositoryResult<AutomaticBackupOutcome> {
    let _operation = match operation_lock.try_lock() {
        Ok(guard) => guard,
        Err(TryLockError::WouldBlock) => return Ok(AutomaticBackupOutcome::Busy),
        Err(TryLockError::Poisoned(_)) => {
            return Err("تعذر تشغيل النسخ الاحتياطي التلقائي بأمان.".into());
        }
    };
    let connection = initialize(app_data_directory).map_err(|error| error.to_string())?;
    let Some(configured) = setting(&connection, BACKUP_DIRECTORY_KEY)? else {
        return Ok(AutomaticBackupOutcome::NoDirectory);
    };
    if !automatic_backup_due(&connection)? {
        return Ok(AutomaticBackupOutcome::NotDue);
    }
    let directory = PathBuf::from(configured);
    let result = create_validated_backup(&connection, &directory, AUTO_BACKUP_PREFIX).and_then(
        |(path, completed_at)| {
            finalize_automatic_backup(&connection, &directory, &path, &completed_at)?;
            Ok(())
        },
    );
    match result {
        Ok(()) => Ok(AutomaticBackupOutcome::Created),
        Err(error) => {
            record_automatic_failure(&connection, &error);
            Err(error)
        }
    }
}

pub fn restore(
    app_data_directory: &Path,
    source_path: &str,
    operation_lock: &BackupOperationLock,
) -> RepositoryResult<RestoreResult> {
    let _operation = acquire_user_operation(operation_lock)?;
    restore_with_recovery_directory(
        app_data_directory,
        Path::new(source_path),
        &app_data_directory.join("recovery"),
    )
}

fn restore_with_recovery_directory(
    app_data_directory: &Path,
    source_path: &Path,
    recovery_directory: &Path,
) -> RepositoryResult<RestoreResult> {
    let source = open_valid_database(source_path)?;
    fs::create_dir_all(recovery_directory)
        .map_err(|_| "تعذر إنشاء مجلد الاسترداد الآمن. لم يتم تغيير البيانات الحالية.".to_string())?;
    validate_writable_directory(recovery_directory).map_err(|_| {
        "تعذر إنشاء نسخة أمان قبل الاستعادة. لم يتم تغيير البيانات الحالية.".to_string()
    })?;
    let mut live = initialize(app_data_directory).map_err(|error| error.to_string())?;
    let timestamp = database_timestamp(&live)?;
    let safety_path =
        available_backup_path(recovery_directory, "albaraa-before-restore", &timestamp);
    if let Err(error) = copy_database(&live, &safety_path) {
        let _ = fs::remove_file(&safety_path);
        return Err(format!("تعذر إنشاء نسخة أمان قبل الاستعادة: {error}"));
    }
    if let Err(error) = open_valid_database(&safety_path) {
        let _ = fs::remove_file(&safety_path);
        return Err(format!("تعذر التحقق من نسخة الأمان قبل الاستعادة: {error}"));
    }

    let restore_result = Backup::new(&source, &mut live)
        .and_then(|backup| backup.run_to_completion(32, Duration::from_millis(20), None));
    if let Err(error) = restore_result {
        return Err(format!(
            "تعذرت استعادة النسخة الاحتياطية. بقيت البيانات الحالية دون تغيير: {error}"
        ));
    }
    if let Err(validation_error) = validate_database(&live) {
        let safety = open_valid_database(&safety_path)?;
        Backup::new(&safety, &mut live)
            .and_then(|backup| backup.run_to_completion(32, Duration::from_millis(20), None))
            .map_err(|error| format!("فشلت الاستعادة وتعذر إرجاع نسخة الأمان: {error}"))?;
        return Err(format!(
            "فشلت الاستعادة وأُعيدت البيانات الحالية من نسخة الأمان: {validation_error}"
        ));
    }
    drop(live);
    initialize(app_data_directory)
        .map_err(|_| "تعذر إعادة فتح قاعدة البيانات بعد الاستعادة.".to_string())?;
    Ok(RestoreResult {
        safety_backup_path: safety_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::DATABASE_FILE_NAME;
    use crate::database::records::{
        CustomerInput, ProductInput, ReceiptInput, SaleInput, TransferInput,
    };
    use crate::database::{auth, customers, products, receipts, sales, transfers};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new(label: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "albaraa-backup-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn configures_changes_and_persists_backup_directory() {
        let app = TestDirectory::new("settings");
        let first = TestDirectory::new("first");
        let second = TestDirectory::new("second");
        let connection = initialize(&app.0).unwrap();
        let configured = configure_directory(&connection, first.0.to_str().unwrap()).unwrap();
        assert_eq!(
            PathBuf::from(configured.backup_directory.unwrap()),
            first.0.canonicalize().unwrap()
        );
        configure_directory(&connection, second.0.to_str().unwrap()).unwrap();
        drop(connection);
        let reopened = initialize(&app.0).unwrap();
        assert_eq!(
            PathBuf::from(settings(&reopened).unwrap().backup_directory.unwrap()),
            second.0.canonicalize().unwrap()
        );
        assert!(configure_directory(&reopened, app.0.join("missing").to_str().unwrap()).is_err());
    }

    #[test]
    fn creates_valid_timestamped_coexisting_complete_backups() {
        let app = TestDirectory::new("complete");
        let destination = TestDirectory::new("destination");
        let mut connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        auth::create_first(
            &mut connection,
            auth::CreateAccountInput {
                username: "admin".into(),
                password: "password-1".into(),
            },
        )
        .unwrap();
        let customer = customers::save(
            &connection,
            None,
            CustomerInput {
                name: "Customer".into(),
                phone: String::new(),
                notes: String::new(),
            },
        )
        .unwrap();
        let product = products::save(
            &connection,
            None,
            ProductInput {
                name: "Product".into(),
                notes: String::new(),
            },
        )
        .unwrap();
        sales::create(
            &mut connection,
            SaleInput {
                customer_id: customer.id.clone(),
                product_id: product.id,
                weight_tons: "1".into(),
                unit_sale_price: "100".into(),
                sale_currency: "IQD".into(),
                total_amount: 100.0,
                driver_name: "Driver".into(),
                sale_date: "2026-10-06".into(),
            },
        )
        .unwrap();
        receipts::create(
            &mut connection,
            ReceiptInput {
                customer_id: customer.id.clone(),
                amount: "25".into(),
                currency: "IQD".into(),
                business_date: "2026-10-06".into(),
                notes: String::new(),
            },
        )
        .unwrap();
        transfers::create(
            &mut connection,
            TransferInput {
                customer_id: customer.id.clone(),
                amount: "10".into(),
                currency: "USD".into(),
                business_date: "2026-10-06".into(),
                description: "Transfer backup test".into(),
                notes: String::new(),
            },
        )
        .unwrap();
        drop(connection);

        let operation_lock = BackupOperationLock::new(());
        let first = create_manual(&app.0, &operation_lock).unwrap();
        let second = create_manual(&app.0, &operation_lock).unwrap();
        assert_ne!(first.path, second.path);
        assert!(
            Path::new(&first.path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("albaraa-backup-20")
        );
        let backup = open_valid_database(Path::new(&first.path)).unwrap();
        for table in [
            "local_user",
            "customers",
            "products",
            "sales",
            "receipts",
            "transfers",
            "operation_history",
        ] {
            let count: i64 = backup
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert!(count > 0, "missing rows in {table}");
        }
        assert!(
            settings(&initialize(&app.0).unwrap())
                .unwrap()
                .last_successful_backup_at
                .is_some()
        );
    }

    #[test]
    fn rejects_unrelated_corrupt_and_unsupported_files() {
        let area = TestDirectory::new("invalid");
        let unrelated = area.0.join("unrelated.db");
        Connection::open(&unrelated)
            .unwrap()
            .execute("CREATE TABLE other(value TEXT)", [])
            .unwrap();
        assert!(open_valid_database(&unrelated).is_err());
        let corrupt = area.0.join("corrupt.db");
        fs::write(&corrupt, b"not sqlite").unwrap();
        assert!(open_valid_database(&corrupt).is_err());
        let unsupported_dir = area.0.join("unsupported");
        let connection = initialize(&unsupported_dir).unwrap();
        connection.pragma_update(None, "user_version", 99).unwrap();
        assert!(open_valid_database(&unsupported_dir.join(DATABASE_FILE_NAME)).is_err());
    }

    #[test]
    fn restores_original_data_credentials_and_creates_safety_backup() {
        let app = TestDirectory::new("restore");
        let destination = TestDirectory::new("restore-destination");
        let mut connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        auth::create_first(
            &mut connection,
            auth::CreateAccountInput {
                username: "original".into(),
                password: "original-pass".into(),
            },
        )
        .unwrap();
        let customer = customers::save(
            &connection,
            None,
            CustomerInput {
                name: "Original customer".into(),
                phone: String::new(),
                notes: String::new(),
            },
        )
        .unwrap();
        let product = products::save(
            &connection,
            None,
            ProductInput {
                name: "Original product".into(),
                notes: String::new(),
            },
        )
        .unwrap();
        sales::create(
            &mut connection,
            SaleInput {
                customer_id: customer.id.clone(),
                product_id: product.id,
                weight_tons: "2".into(),
                driver_name: "Original driver".into(),
                unit_sale_price: "100".into(),
                sale_currency: "IQD".into(),
                total_amount: 200.0,
                sale_date: "2026-10-06".into(),
            },
        )
        .unwrap();
        receipts::create(
            &mut connection,
            ReceiptInput {
                customer_id: customer.id.clone(),
                amount: "50".into(),
                currency: "IQD".into(),
                business_date: "2026-10-06".into(),
                notes: "Original receipt".into(),
            },
        )
        .unwrap();
        transfers::create(
            &mut connection,
            TransferInput {
                customer_id: customer.id,
                amount: "10".into(),
                currency: "IQD".into(),
                business_date: "2026-10-06".into(),
                description: "Original transfer".into(),
                notes: String::new(),
            },
        )
        .unwrap();
        drop(connection);
        let operation_lock = BackupOperationLock::new(());
        let backup = create_manual(&app.0, &operation_lock).unwrap();
        let mut connection = initialize(&app.0).unwrap();
        auth::change_password(
            &mut connection,
            auth::ChangePasswordInput {
                current_password: "original-pass".into(),
                new_password: "changed-pass".into(),
            },
        )
        .unwrap();
        customers::save(
            &connection,
            None,
            CustomerInput {
                name: "Later customer".into(),
                phone: String::new(),
                notes: String::new(),
            },
        )
        .unwrap();
        drop(connection);

        let result = restore(&app.0, &backup.path, &operation_lock).unwrap();
        assert!(Path::new(&result.safety_backup_path).is_file());
        let restored = initialize(&app.0).unwrap();
        assert!(
            auth::login(
                &restored,
                auth::LoginInput {
                    username: "original".into(),
                    password: "original-pass".into()
                }
            )
            .is_ok()
        );
        assert!(
            auth::login(
                &restored,
                auth::LoginInput {
                    username: "original".into(),
                    password: "changed-pass".into()
                }
            )
            .is_err()
        );
        assert_eq!(customers::list(&restored, None).unwrap().len(), 1);
        assert_eq!(
            customers::list(&restored, None).unwrap()[0].name,
            "Original customer"
        );
        assert_eq!(
            customers::list(&restored, None).unwrap()[0].iqd_balance,
            160.0
        );
        assert_eq!(products::list(&restored, None).unwrap().len(), 1);
        assert_eq!(sales::list(&restored, None).unwrap().len(), 1);
        assert_eq!(receipts::list(&restored, None).unwrap().len(), 1);
        assert_eq!(transfers::list(&restored, None).unwrap().len(), 1);
        let history_count: i64 = restored
            .query_row("SELECT count(*) FROM operation_history", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(history_count, 3);
    }

    #[test]
    fn failed_safety_backup_or_invalid_restore_keeps_live_database() {
        let app = TestDirectory::new("failed");
        let source_app = TestDirectory::new("source");
        let source_connection = initialize(&source_app.0).unwrap();
        drop(source_connection);
        let live = initialize(&app.0).unwrap();
        customers::save(
            &live,
            None,
            CustomerInput {
                name: "Keep me".into(),
                phone: String::new(),
                notes: String::new(),
            },
        )
        .unwrap();
        drop(live);
        let blocked_recovery = app.0.join("blocked");
        fs::write(&blocked_recovery, b"file blocks directory").unwrap();
        assert!(
            restore_with_recovery_directory(
                &app.0,
                &source_app.0.join(DATABASE_FILE_NAME),
                &blocked_recovery
            )
            .is_err()
        );
        let live = initialize(&app.0).unwrap();
        assert_eq!(customers::list(&live, None).unwrap()[0].name, "Keep me");
        drop(live);
        let invalid = app.0.join("invalid.db");
        fs::write(&invalid, b"bad").unwrap();
        assert!(
            restore(
                &app.0,
                invalid.to_str().unwrap(),
                &BackupOperationLock::new(())
            )
            .is_err()
        );
        assert_eq!(
            customers::list(&initialize(&app.0).unwrap(), None)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn automatic_backup_due_rules_and_startup_check() {
        let app = TestDirectory::new("auto-due");
        let destination = TestDirectory::new("auto-due-destination");
        let connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        assert!(automatic_backup_due(&connection).unwrap());
        set_setting(
            &connection,
            LAST_AUTO_BACKUP_KEY,
            &connection
                .query_row(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
        )
        .unwrap();
        assert!(!automatic_backup_due(&connection).unwrap());
        set_setting(
            &connection,
            LAST_AUTO_BACKUP_KEY,
            &connection
                .query_row(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours')",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
        )
        .unwrap();
        assert!(automatic_backup_due(&connection).unwrap());
        drop(connection);

        let lock = BackupOperationLock::new(());
        assert_eq!(
            run_automatic_if_due(&app.0, &lock).unwrap(),
            AutomaticBackupOutcome::Created
        );
        assert_eq!(
            run_automatic_if_due(&app.0, &lock).unwrap(),
            AutomaticBackupOutcome::NotDue
        );
        let connection = initialize(&app.0).unwrap();
        let auto_timestamp = setting(&connection, LAST_AUTO_BACKUP_KEY).unwrap();
        assert!(auto_timestamp.is_some());
        assert_eq!(
            setting(&connection, LAST_BACKUP_KEY).unwrap(),
            auto_timestamp
        );
        assert_eq!(automatic_backup_files(&destination.0).unwrap().len(), 1);
        open_valid_database(&automatic_backup_files(&destination.0).unwrap()[0]).unwrap();
    }

    #[test]
    fn unavailable_or_invalid_automatic_backup_is_not_successful() {
        let app = TestDirectory::new("auto-failure");
        let destination = TestDirectory::new("auto-failure-destination");
        let connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        let corrupt = destination
            .0
            .join("albaraa-auto-backup-2000-01-01-000000.db");
        fs::write(&corrupt, b"invalid").unwrap();
        assert!(
            finalize_automatic_backup(
                &connection,
                &destination.0,
                &corrupt,
                "2026-10-06T00:00:00Z"
            )
            .is_err()
        );
        assert!(
            setting(&connection, LAST_AUTO_BACKUP_KEY)
                .unwrap()
                .is_none()
        );
        drop(connection);

        fs::remove_dir_all(&destination.0).unwrap();
        let lock = BackupOperationLock::new(());
        assert!(run_automatic_if_due(&app.0, &lock).is_err());
        let connection = initialize(&app.0).unwrap();
        assert!(
            setting(&connection, LAST_AUTO_BACKUP_KEY)
                .unwrap()
                .is_none()
        );
        let status = settings(&connection).unwrap();
        assert!(!status.automatic_backup_available);
        assert!(status.automatic_backup_warning.is_some());
    }

    #[test]
    fn twenty_first_automatic_backup_removes_only_oldest_automatic_file() {
        let app = TestDirectory::new("retention");
        let destination = TestDirectory::new("retention-destination");
        let connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        for index in 0..20 {
            fs::write(
                destination
                    .0
                    .join(format!("albaraa-auto-backup-2000-01-01-00{index:04}.db")),
                b"old automatic backup",
            )
            .unwrap();
        }
        let oldest = destination
            .0
            .join("albaraa-auto-backup-2000-01-01-000000.db");
        let manual = destination.0.join("albaraa-backup-2000-01-01-000000.db");
        let unrelated = destination.0.join("customer-file.db");
        let safety = destination
            .0
            .join("albaraa-before-restore-2000-01-01-000000.db");
        fs::write(&manual, b"manual").unwrap();
        fs::write(&unrelated, b"unrelated").unwrap();
        fs::write(&safety, b"safety").unwrap();
        drop(connection);

        assert_eq!(
            run_automatic_if_due(&app.0, &BackupOperationLock::new(())).unwrap(),
            AutomaticBackupOutcome::Created
        );
        assert_eq!(automatic_backup_files(&destination.0).unwrap().len(), 20);
        assert!(!oldest.exists());
        assert!(manual.exists());
        assert!(unrelated.exists());
        assert!(safety.exists());
        assert_eq!(
            settings(&initialize(&app.0).unwrap())
                .unwrap()
                .automatic_backup_count,
            20
        );
    }

    #[test]
    fn shared_lock_prevents_concurrent_backup_and_restore_operations() {
        let app = TestDirectory::new("concurrency");
        let destination = TestDirectory::new("concurrency-destination");
        let connection = initialize(&app.0).unwrap();
        configure_directory(&connection, destination.0.to_str().unwrap()).unwrap();
        drop(connection);
        let lock = BackupOperationLock::new(());
        let held_by_restore = lock.lock().unwrap();
        assert_eq!(
            run_automatic_if_due(&app.0, &lock).unwrap(),
            AutomaticBackupOutcome::Busy
        );
        assert!(create_manual(&app.0, &lock).is_err());
        assert!(restore(&app.0, "unused.db", &lock).is_err());
        drop(held_by_restore);
        assert_eq!(
            run_automatic_if_due(&app.0, &lock).unwrap(),
            AutomaticBackupOutcome::Created
        );
    }
}
