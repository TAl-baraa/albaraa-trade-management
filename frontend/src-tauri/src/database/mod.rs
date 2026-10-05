use rusqlite::{Connection, TransactionBehavior};
pub mod customers;
pub mod products;
pub mod receipts;
pub mod records;
#[cfg(test)]
mod repository_tests;
pub mod sales;
use std::{error::Error, fs, io, path::Path, time::Duration};

const SCHEMA_VERSION: i64 = 2;
const SCHEMA: &str = include_str!("schema.sql");
const TABLES: [&str; 6] = [
    "app_metadata",
    "customers",
    "products",
    "sales",
    "receipts",
    "operation_history",
];

/// Every future repository connection must use this function to enable foreign keys.
pub fn initialize(app_data_dir: &Path) -> Result<Connection, Box<dyn Error>> {
    fs::create_dir_all(app_data_dir)?;
    let mut connection = Connection::open(app_data_dir.join("albaraa.db"))?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.pragma_update(None, "synchronous", "FULL")?;

    // The schema and both version markers commit together, including on first launch.
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let version: i64 = transaction.pragma_query_value(None, "user_version", |row| row.get(0))?;
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
    fn schema_enforces_accounting_relationships_and_deletion_metadata() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", true)
            .unwrap();
        connection.execute_batch(SCHEMA).unwrap();
        connection.execute("INSERT INTO products(id, name, normalized_name, created_at, updated_at) VALUES ('p', 'Original product', 'original product', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
        connection.execute("INSERT INTO customers(id, name, created_at, updated_at, iqd_balance_minor, usd_balance_minor) VALUES ('c', 'Customer', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z', 100, -250)", []).unwrap();
        connection.execute("INSERT INTO receipts(id, customer_id, customer_name_snapshot, amount_minor, currency, business_date, created_at, updated_at) VALUES ('r', 'c', 'Snapshot', 125, 'USD', '2026-10-05', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00Z')", []).unwrap();
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
