use super::records::*;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};

pub fn list(connection: &Connection, archived: Option<bool>) -> RepositoryResult<Vec<Customer>> {
    let mut statement = connection.prepare("SELECT * FROM customers WHERE (?1 IS NULL OR is_archived = ?1) ORDER BY created_at DESC, rowid DESC").map_err(database_error)?;
    statement
        .query_map([archived], Customer::from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Customer>> {
    connection
        .query_row(
            "SELECT * FROM customers WHERE id = ?1",
            [id],
            Customer::from_row,
        )
        .optional()
        .map_err(database_error)
}

pub fn save(
    connection: &Connection,
    id: Option<&str>,
    input: CustomerInput,
) -> RepositoryResult<Customer> {
    if input.name.trim().is_empty() {
        return Err("اسم الزبون مطلوب.".into());
    }
    let iqd = money_minor(input.iqd_balance)?;
    let usd = money_minor(input.usd_balance)?;
    let record_id = match id {
        Some(value) => value.to_owned(),
        None => new_id(connection, "customer")?,
    };
    let count = if id.is_some() {
        connection.execute(&format!("UPDATE customers SET name=?2, phone=?3, notes=?4, iqd_balance_minor=?5, usd_balance_minor=?6, updated_at={NOW} WHERE id=?1"), params![record_id, input.name.trim(), input.phone.trim(), input.notes.trim(), iqd, usd])
    } else {
        connection.execute(&format!("INSERT INTO customers(id, name, phone, notes, iqd_balance_minor, usd_balance_minor, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, {NOW}, {NOW})"), params![record_id, input.name.trim(), input.phone.trim(), input.notes.trim(), iqd, usd])
    }.map_err(database_error)?;
    require_changed(count)?;
    get(connection, &record_id)?.ok_or_else(|| "الزبون غير موجود.".into())
}

pub fn set_archived(
    connection: &Connection,
    id: &str,
    archived: bool,
) -> RepositoryResult<Customer> {
    let count = connection.execute(&format!("UPDATE customers SET is_archived=?2, archived_at=CASE WHEN ?2 THEN {NOW} ELSE NULL END, updated_at={NOW} WHERE id=?1 AND (?2=0 OR (iqd_balance_minor=0 AND usd_balance_minor=0))"), params![id, archived]).map_err(database_error)?;
    if count != 1 {
        return Err("تعذر تغيير حالة الزبون. يجب تسديد الحساب بالكامل قبل الأرشفة.".into());
    }
    get(connection, id)?.ok_or_else(|| "الزبون غير موجود.".into())
}

pub fn delete(connection: &Connection, id: &str) -> RepositoryResult<()> {
    let count = connection.execute("DELETE FROM customers WHERE id=?1 AND iqd_balance_minor=0 AND usd_balance_minor=0 AND has_transaction_history=0 AND NOT EXISTS (SELECT 1 FROM sales WHERE customer_id=?1) AND NOT EXISTS (SELECT 1 FROM receipts WHERE customer_id=?1)", [id]).map_err(database_error)?;
    if count == 1 {
        Ok(())
    } else {
        Err("لا يمكن حذف زبون له رصيد أو سجل معاملات.".into())
    }
}

/// Temporary bridge: legacy transaction calculations remain in TypeScript.
/// Only balance/history fields are writable here, and stale balance writes fail atomically.
pub fn update_balances(
    connection: &mut Connection,
    updates: Vec<CustomerBalanceUpdate>,
) -> RepositoryResult<()> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    for update in updates {
        let count = transaction.execute(&format!("UPDATE customers SET iqd_balance_minor=?2, usd_balance_minor=?3, has_transaction_history=MAX(has_transaction_history, ?4), updated_at={NOW} WHERE id=?1 AND iqd_balance_minor=?5 AND usd_balance_minor=?6"), params![update.id, money_minor(update.iqd_balance)?, money_minor(update.usd_balance)?, update.has_transaction_history, money_minor(update.expected_iqd_balance)?, money_minor(update.expected_usd_balance)?]).map_err(database_error)?;
        if count != 1 {
            return Err("تغير رصيد الزبون. حدّث الصفحة وأعد المحاولة.".into());
        }
    }
    transaction.commit().map_err(database_error)
}
