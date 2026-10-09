use super::records::*;
use rusqlite::{Connection, OptionalExtension, params};

const SELECT_WITH_LAST_TRANSACTION_DATES: &str = "SELECT
    customers.id,
    customers.name,
    customers.phone,
    customers.notes,
    customers.iqd_balance_minor,
    customers.usd_balance_minor,
    (SELECT MAX(sales.sale_date) FROM sales WHERE sales.customer_id = customers.id AND sales.is_deleted = 0) AS last_purchase_date,
    (SELECT MAX(receipts.business_date) FROM receipts WHERE receipts.customer_id = customers.id AND receipts.is_deleted = 0) AS last_payment_date,
    customers.has_transaction_history,
    customers.is_archived,
    customers.created_at,
    customers.updated_at,
    customers.archived_at
FROM customers";

pub fn list(connection: &Connection, archived: Option<bool>) -> RepositoryResult<Vec<Customer>> {
    let sql = format!(
        "{SELECT_WITH_LAST_TRANSACTION_DATES} WHERE (?1 IS NULL OR customers.is_archived = ?1) ORDER BY customers.created_at DESC, customers.rowid DESC"
    );
    let mut statement = connection.prepare(&sql).map_err(database_error)?;
    statement
        .query_map([archived], Customer::from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Customer>> {
    let sql = format!("{SELECT_WITH_LAST_TRANSACTION_DATES} WHERE customers.id = ?1");
    connection
        .query_row(&sql, [id], Customer::from_row)
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
    let record_id = match id {
        Some(value) => value.to_owned(),
        None => new_id(connection, "customer")?,
    };
    let count = if id.is_some() {
        connection.execute(&format!("UPDATE customers SET name=?2, phone=?3, notes=?4, updated_at={NOW} WHERE id=?1"), params![record_id, input.name.trim(), input.phone.trim(), input.notes.trim()])
    } else {
        connection.execute(&format!("INSERT INTO customers(id, name, phone, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW})"), params![record_id, input.name.trim(), input.phone.trim(), input.notes.trim()])
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
    let count = connection.execute("DELETE FROM customers WHERE id=?1 AND iqd_balance_minor=0 AND usd_balance_minor=0 AND has_transaction_history=0 AND NOT EXISTS (SELECT 1 FROM sales WHERE customer_id=?1) AND NOT EXISTS (SELECT 1 FROM receipts WHERE customer_id=?1) AND NOT EXISTS (SELECT 1 FROM transfers WHERE customer_id=?1)", [id]).map_err(database_error)?;
    if count == 1 {
        Ok(())
    } else {
        Err("لا يمكن حذف زبون له رصيد أو سجل معاملات.".into())
    }
}
