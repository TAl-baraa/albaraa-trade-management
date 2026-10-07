use rusqlite::{Connection, OpenFlags, TransactionBehavior, backup::Backup};
pub mod auth;
pub mod backup;
pub mod customers;
pub mod products;
pub mod receipts;
pub mod records;
#[cfg(test)]
mod repository_tests;
pub mod sales;
pub mod transfers;
use std::{
    error::Error,
    fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

pub(crate) const DATABASE_FILE_NAME: &str = "albaraa.db";
pub(crate) const SCHEMA_VERSION: i64 = 4;
const SCHEMA: &str = include_str!("schema.sql");
pub(crate) const TABLES: [&str; 8] = [
    "app_metadata",
    "local_user",
    "customers",
    "products",
    "sales",
    "receipts",
    "transfers",
    "operation_history",
];

/// Every future repository connection must use this function to enable foreign keys.
pub fn initialize(app_data_dir: &Path) -> Result<Connection, Box<dyn Error>> {
    fs::create_dir_all(app_data_dir)?;
    let mut connection = Connection::open(app_data_dir.join(DATABASE_FILE_NAME))?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.pragma_update(None, "synchronous", "FULL")?;

    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if matches!(version, 2 | 3) {
        create_pre_migration_backup(&connection, app_data_dir, version)?;
    }

    // The schema and both version markers commit together, including on first launch.
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    match version {
        0 => {
            let existing_tables: i64 = transaction.query_row(
                "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [], |row| row.get(0),
            )?;
            if existing_tables != 0 {
                return Err(io::Error::other("قاعدة البيانات غير مهيأة بإصدار معروف").into());
            }
            transaction.execute_batch(SCHEMA)?;
        }
        2 => {
            transaction.execute_batch(
                "CREATE TABLE local_user (
                    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
                    username TEXT NOT NULL CHECK (length(trim(username)) > 0),
                    password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                ) STRICT;
                UPDATE app_metadata SET value = '3', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = 'schema_version';
                PRAGMA user_version = 3;",
            )?;
            migrate_v3_to_v4(&transaction)?;
        }
        3 => migrate_v3_to_v4(&transaction)?,
        SCHEMA_VERSION => {}
        _ => return Err(io::Error::other("إصدار قاعدة البيانات غير مدعوم").into()),
    }
    let metadata_version: String = transaction.query_row(
        "SELECT value FROM app_metadata WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    )?;
    if metadata_version != SCHEMA_VERSION.to_string() {
        return Err(io::Error::other("إصدار قاعدة البيانات غير متطابق").into());
    }
    for table in TABLES {
        transaction.prepare(&format!("SELECT * FROM {table} LIMIT 0"))?;
    }
    transaction.commit()?;
    Ok(connection)
}

fn create_pre_migration_backup(
    connection: &Connection,
    app_data_dir: &Path,
    source_version: i64,
) -> Result<PathBuf, Box<dyn Error>> {
    let recovery_directory = app_data_dir.join("recovery");
    fs::create_dir_all(&recovery_directory)?;
    let timestamp: String = connection.query_row(
        "SELECT strftime('%Y-%m-%d-%H%M%S', 'now', 'localtime')",
        [],
        |row| row.get(0),
    )?;
    let mut backup_path =
        recovery_directory.join(format!("albaraa-before-migration-{timestamp}.db"));
    for suffix in 2.. {
        if !backup_path.exists() {
            break;
        }
        backup_path =
            recovery_directory.join(format!("albaraa-before-migration-{timestamp}-{suffix}.db"));
    }

    let backup_result = (|| -> Result<(), Box<dyn Error>> {
        let mut destination = Connection::open(&backup_path)?;
        Backup::new(connection, &mut destination)?.run_to_completion(
            32,
            Duration::from_millis(20),
            None,
        )?;
        drop(destination);

        let validation =
            Connection::open_with_flags(&backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let integrity: String =
            validation.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(io::Error::other("فشل التحقق من سلامة نسخة ما قبل الترحيل").into());
        }
        let backup_version: i64 =
            validation.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let metadata_version: String = validation.query_row(
            "SELECT value FROM app_metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )?;
        if backup_version != source_version || metadata_version != source_version.to_string() {
            return Err(
                io::Error::other("نسخة ما قبل الترحيل لا تطابق إصدار قاعدة البيانات").into(),
            );
        }
        Ok(())
    })();

    if let Err(error) = backup_result {
        let _ = fs::remove_file(&backup_path);
        return Err(error);
    }
    Ok(backup_path)
}

fn migrate_v3_to_v4(transaction: &rusqlite::Transaction<'_>) -> rusqlite::Result<()> {
    transaction.execute_batch(
        "CREATE TABLE transfers (
            id TEXT PRIMARY KEY NOT NULL,
            customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            customer_name_snapshot TEXT NOT NULL,
            amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
            currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
            business_date TEXT NOT NULL CHECK (length(business_date) = 10 AND business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(business_date, '+0 days') IS business_date),
            description TEXT NOT NULL CHECK (length(trim(description)) > 0),
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
            deleted_at TEXT,
            deleted_by TEXT,
            deletion_reason TEXT,
            CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL) OR
                (is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND deletion_reason IS NOT NULL AND length(trim(deletion_reason)) > 0))
        ) STRICT;
        CREATE TABLE operation_history_v4 (
            id TEXT PRIMARY KEY NOT NULL,
            sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
            receipt_id TEXT REFERENCES receipts(id) ON DELETE RESTRICT,
            transfer_id TEXT REFERENCES transfers(id) ON DELETE RESTRICT,
            operation_type TEXT NOT NULL CHECK (operation_type IN ('created', 'updated', 'deleted')),
            actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
            changed_at TEXT NOT NULL,
            changes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes_json) AND json_type(changes_json) = 'array'),
            CHECK ((sale_id IS NOT NULL) + (receipt_id IS NOT NULL) + (transfer_id IS NOT NULL) = 1)
        ) STRICT;
        INSERT INTO operation_history_v4(id, sale_id, receipt_id, operation_type, actor, changed_at, changes_json)
            SELECT id, sale_id, receipt_id, operation_type, actor, changed_at, changes_json FROM operation_history;
        DROP TABLE operation_history;
        ALTER TABLE operation_history_v4 RENAME TO operation_history;
        CREATE INDEX transfers_register ON transfers(is_deleted, business_date, created_at);
        CREATE INDEX transfers_customer ON transfers(customer_id, is_deleted, business_date);
        CREATE INDEX history_sale ON operation_history(sale_id, changed_at);
        CREATE INDEX history_receipt ON operation_history(receipt_id, changed_at);
        CREATE INDEX history_transfer ON operation_history(transfer_id, changed_at);
        UPDATE app_metadata SET value = '4', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE key = 'schema_version';
        PRAGMA user_version = 4;",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn initializes_empty_database_and_preserves_it_on_reopen() {
        let directory = std::env::temp_dir().join(format!(
            "albaraa-db-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let connection = initialize(&directory).unwrap();
        assert!(directory.join("albaraa.db").is_file());
        for table in TABLES.into_iter().filter(|name| *name != "app_metadata") {
            let count: i64 = connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0);
        }
        connection
            .execute(
                "INSERT INTO app_metadata(key, value) VALUES ('test_setting', 'retained')",
                [],
            )
            .unwrap();
        drop(connection);
        let connection = initialize(&directory).unwrap();
        let setting: String = connection
            .query_row(
                "SELECT value FROM app_metadata WHERE key = 'test_setting'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(setting, "retained");
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        connection.pragma_update(None, "user_version", 99).unwrap();
        assert!(initialize(&directory).is_err());
        connection
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .unwrap();
        connection
            .execute(
                "UPDATE app_metadata SET value = '99' WHERE key = 'schema_version'",
                [],
            )
            .unwrap();
        assert!(initialize(&directory).is_err());
        drop(connection);
        fs::remove_file(directory.join("albaraa.db")).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn migration_aborts_when_recovery_backup_cannot_be_created() {
        let directory = std::env::temp_dir().join(format!(
            "albaraa-migration-failure-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let connection = initialize(&directory).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE operation_history_v3 (
                    id TEXT PRIMARY KEY NOT NULL,
                    sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
                    receipt_id TEXT REFERENCES receipts(id) ON DELETE RESTRICT,
                    operation_type TEXT NOT NULL CHECK (operation_type IN ('created', 'updated', 'deleted')),
                    actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
                    changed_at TEXT NOT NULL,
                    changes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes_json) AND json_type(changes_json) = 'array'),
                    CHECK ((sale_id IS NOT NULL) + (receipt_id IS NOT NULL) = 1)
                ) STRICT;
                DROP TABLE operation_history;
                ALTER TABLE operation_history_v3 RENAME TO operation_history;
                DROP TABLE transfers;
                UPDATE app_metadata SET value = '3' WHERE key = 'schema_version';
                PRAGMA user_version = 3;",
            )
            .unwrap();
        drop(connection);
        fs::write(directory.join("recovery"), b"not a directory").unwrap();

        assert!(initialize(&directory).is_err());
        let connection = Connection::open(directory.join(DATABASE_FILE_NAME)).unwrap();
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
        drop(connection);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn schema_enforces_accounting_relationships_and_deletion_metadata() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        connection.execute_batch(SCHEMA).unwrap();
        connection.execute("INSERT INTO products(id, name, normalized_name, created_at, updated_at) VALUES ('p', 'Original product', 'original product', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
        connection.execute("INSERT INTO customers(id, name, created_at, updated_at, iqd_balance_minor, usd_balance_minor) VALUES ('c', 'Customer', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z', 100, -250)", []).unwrap();
        connection.execute("INSERT INTO receipts(id, customer_id, customer_name_snapshot, amount_minor, currency, business_date, created_at, updated_at) VALUES ('r', 'c', 'Snapshot', 125, 'USD', '2026-10-05', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
        connection.execute("INSERT INTO transfers(id, customer_id, customer_name_snapshot, amount_minor, currency, business_date, description, created_at, updated_at) VALUES ('t', 'c', 'Snapshot', 500, 'IQD', '2026-10-05', 'Transfer description', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
        connection.execute("INSERT INTO sales(id, customer_id, customer_name_snapshot, product_id, product_name_snapshot, weight_tons, driver_name, unit_sale_price, sale_currency, total_amount_minor, sale_date, created_at, updated_at) VALUES ('s', 'c', 'Customer snapshot', 'p', 'Product snapshot', '1.234567', 'Driver', '123.4567', 'IQD', 15242, '2026-10-05', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
        connection
            .execute(
                "UPDATE products SET name = 'Renamed product', is_archived = 1",
                [],
            )
            .unwrap();
        let snapshot: String = connection
            .query_row("SELECT product_name_snapshot FROM sales", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(snapshot, "Product snapshot");
        for sql in [
            "UPDATE receipts SET customer_id = 'missing'",
            "UPDATE receipts SET currency = 'EUR'",
            "UPDATE receipts SET amount_minor = 1.25",
            "UPDATE receipts SET business_date = '2026-02-30'",
            "UPDATE receipts SET is_deleted = 1",
            "UPDATE transfers SET currency = 'EUR'",
            "UPDATE transfers SET description = '   '",
            "UPDATE transfers SET is_deleted = 1",
            "UPDATE sales SET is_deleted = 1",
            "UPDATE sales SET weight_tons = '1.2.3'",
            "UPDATE sales SET unit_sale_price = '0.0'",
            "UPDATE sales SET product_id = 'missing'",
            "DELETE FROM products WHERE id = 'p'",
            "DELETE FROM customers WHERE id = 'c'",
            "INSERT INTO operation_history(id, operation_type, actor, changed_at) VALUES ('h', 'created', 'actor', 'now')",
        ] {
            assert!(
                connection.execute(sql, []).is_err(),
                "accepted invalid SQL: {sql}"
            );
        }
        connection.execute("UPDATE receipts SET is_deleted = 1, deleted_at = '2026-10-05T01:00:00Z', deleted_by = 'actor', deletion_reason = 'reason'", []).unwrap();
        connection.execute("INSERT INTO operation_history(id, receipt_id, operation_type, actor, changed_at, changes_json) VALUES ('h', 'r', 'deleted', 'actor', '2026-10-05T01:00:00Z', '[{\"field\":\"reason\",\"previousValue\":null,\"newValue\":\"reason\"}]')", []).unwrap();
        assert!(
            connection
                .execute("DELETE FROM receipts WHERE id = 'r'", [])
                .is_err()
        );
        let balances: (i64, i64) = connection
            .query_row(
                "SELECT iqd_balance_minor, usd_balance_minor FROM customers",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(balances, (100, -250));
    }
}
