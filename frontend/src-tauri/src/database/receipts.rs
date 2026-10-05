use super::{customers, records::*};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, TransactionBehavior, params};
use serde_json::{Value, json};

const ACTOR: &str = "المستخدم الحالي";

struct ValidatedReceipt {
    customer_id: String,
    customer_snapshot: String,
    amount_minor: i64,
    currency: String,
    business_date: String,
    notes: String,
}

fn positive_amount_minor(value: &str) -> RepositoryResult<i64> {
    let trimmed = value.trim();
    let mut parts = trimmed.split('.');
    let whole = parts.next().unwrap_or_default();
    let fraction = parts.next().unwrap_or_default();
    if parts.next().is_some()
        || whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
        || trimmed.ends_with('.')
    {
        return Err("مبلغ الواصل غير صالح.".into());
    }
    let coefficient = format!("{whole}{fraction}")
        .parse::<u128>()
        .map_err(|_| "مبلغ الواصل يتجاوز الحد المدعوم.".to_string())?;
    let divisor = 10_u128
        .checked_pow(fraction.len() as u32)
        .ok_or_else(|| "مبلغ الواصل يتجاوز الحد المدعوم.".to_string())?;
    let minor = coefficient
        .checked_mul(100)
        .and_then(|amount| amount.checked_add(divisor / 2))
        .ok_or_else(|| "مبلغ الواصل يتجاوز الحد المدعوم.".to_string())?
        / divisor;
    if minor == 0 || minor > 9_007_199_254_740_991_u128 || minor > i64::MAX as u128 {
        return Err("يجب أن يكون مبلغ الواصل أكبر من صفر وضمن الحد المدعوم.".into());
    }
    Ok(minor as i64)
}

fn valid_date(connection: &Connection, date: &str) -> RepositoryResult<bool> {
    connection
        .query_row(
            "SELECT length(?1)=10 AND ?1 GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(?1, '+0 days') IS ?1",
            [date],
            |row| row.get(0),
        )
        .map_err(database_error)
}

fn validate(
    transaction: &Transaction<'_>,
    input: ReceiptInput,
    original: Option<&Receipt>,
) -> RepositoryResult<ValidatedReceipt> {
    if input.currency != "IQD" && input.currency != "USD" {
        return Err("عملة الواصل غير صالحة.".into());
    }
    if !valid_date(transaction, &input.business_date)? {
        return Err("تاريخ الواصل غير صالح.".into());
    }
    let customer_changed = original.is_none_or(|receipt| receipt.customer_id != input.customer_id);
    let customer_snapshot = if customer_changed {
        transaction
            .query_row(
                "SELECT name FROM customers WHERE id=?1 AND is_archived=0",
                [&input.customer_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(|| "تعذر حفظ الواصل لأن بيانات الزبون لم تعد متاحة.".to_string())?
    } else {
        original.unwrap().customer_name_snapshot.clone()
    };
    Ok(ValidatedReceipt {
        customer_id: input.customer_id,
        customer_snapshot,
        amount_minor: positive_amount_minor(&input.amount)?,
        currency: input.currency,
        business_date: input.business_date,
        notes: input.notes.trim().to_owned(),
    })
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Receipt> {
    Ok(Receipt {
        id: row.get("id")?,
        customer_id: row.get("customer_id")?,
        customer_name_snapshot: row.get("customer_name_snapshot")?,
        amount: row.get::<_, i64>("amount_minor")? as f64 / 100.0,
        currency: row.get("currency")?,
        business_date: row.get("business_date")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        is_deleted: row.get("is_deleted")?,
        deleted_at: row.get("deleted_at")?,
        deleted_by: row.get("deleted_by")?,
        deletion_reason: row.get("deletion_reason")?,
        history: Vec::new(),
    })
}

fn history(
    connection: &Connection,
    receipt_id: &str,
) -> RepositoryResult<Vec<OperationHistoryEntry>> {
    let mut statement = connection.prepare("SELECT id, operation_type, actor, changed_at, changes_json FROM operation_history WHERE receipt_id=?1 ORDER BY changed_at, rowid").map_err(database_error)?;
    statement
        .query_map([receipt_id], |row| {
            let encoded: String = row.get(4)?;
            let changes = serde_json::from_str(&encoded).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    encoded.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(OperationHistoryEntry {
                id: row.get(0)?,
                operation_type: row.get(1)?,
                actor: row.get(2)?,
                changed_at: row.get(3)?,
                changes,
            })
        })
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

fn attach_history(
    connection: &Connection,
    mut receipts: Vec<Receipt>,
) -> RepositoryResult<Vec<Receipt>> {
    for receipt in &mut receipts {
        receipt.history = history(connection, &receipt.id)?;
    }
    Ok(receipts)
}

pub fn list(
    connection: &Connection,
    business_date: Option<&str>,
) -> RepositoryResult<Vec<Receipt>> {
    if business_date.is_some_and(|date| !valid_date(connection, date).unwrap_or(false)) {
        return Err("تاريخ العمل غير صالح.".into());
    }
    let mut statement = connection.prepare("SELECT * FROM receipts WHERE (?1 IS NULL OR business_date=?1) ORDER BY created_at DESC, rowid DESC").map_err(database_error)?;
    let receipts = statement
        .query_map([business_date], from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    attach_history(connection, receipts)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Receipt>> {
    let receipt = connection
        .query_row("SELECT * FROM receipts WHERE id=?1", [id], from_row)
        .optional()
        .map_err(database_error)?;
    receipt
        .map(|mut value| {
            value.history = history(connection, id)?;
            Ok(value)
        })
        .transpose()
}

fn add_balance(
    transaction: &Transaction<'_>,
    customer_id: &str,
    currency: &str,
    delta: i64,
) -> RepositoryResult<()> {
    let column = if currency == "IQD" {
        "iqd_balance_minor"
    } else if currency == "USD" {
        "usd_balance_minor"
    } else {
        return Err("عملة الواصل غير صالحة.".into());
    };
    let sql = format!(
        "UPDATE customers SET {column}={column}+?2, has_transaction_history=1, updated_at={NOW} WHERE id=?1"
    );
    require_changed(
        transaction
            .execute(&sql, params![customer_id, delta])
            .map_err(database_error)?,
    )
}

fn add_history(
    transaction: &Transaction<'_>,
    receipt_id: &str,
    operation: &str,
    changes: &[AuditFieldChange],
) -> RepositoryResult<()> {
    let id = new_id(transaction, "history")?;
    let encoded =
        serde_json::to_string(changes).map_err(|_| "تعذر حفظ سجل التغييرات.".to_string())?;
    transaction.execute(&format!("INSERT INTO operation_history(id, receipt_id, operation_type, actor, changed_at, changes_json) VALUES (?1, ?2, ?3, ?4, {NOW}, ?5)"), params![id, receipt_id, operation, ACTOR, encoded]).map_err(database_error)?;
    Ok(())
}

fn change(field: &str, previous: Value, next: Value) -> Option<AuditFieldChange> {
    (previous != next).then(|| AuditFieldChange {
        field: field.into(),
        previous_value: previous,
        new_value: next,
    })
}

fn result(connection: &Connection, receipt_id: Option<&str>) -> RepositoryResult<ReceiptMutation> {
    Ok(ReceiptMutation {
        receipt: receipt_id
            .map(|id| get(connection, id))
            .transpose()?
            .flatten(),
        receipts: list(connection, None)?,
        customers: customers::list(connection, None)?,
    })
}

pub fn create(
    connection: &mut Connection,
    input: ReceiptInput,
) -> RepositoryResult<ReceiptMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let receipt = validate(&transaction, input, None)?;
    let id = new_id(&transaction, "receipt")?;
    transaction.execute(&format!("INSERT INTO receipts(id, customer_id, customer_name_snapshot, amount_minor, currency, business_date, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, {NOW}, {NOW})"), params![id, receipt.customer_id, receipt.customer_snapshot, receipt.amount_minor, receipt.currency, receipt.business_date, receipt.notes]).map_err(database_error)?;
    add_balance(
        &transaction,
        &receipt.customer_id,
        &receipt.currency,
        -receipt.amount_minor,
    )?;
    add_history(
        &transaction,
        &id,
        "created",
        &[
            AuditFieldChange {
                field: "اسم الزبون".into(),
                previous_value: Value::Null,
                new_value: json!(receipt.customer_snapshot),
            },
            AuditFieldChange {
                field: "المبلغ".into(),
                previous_value: Value::Null,
                new_value: json!(receipt.amount_minor as f64 / 100.0),
            },
            AuditFieldChange {
                field: "العملة".into(),
                previous_value: Value::Null,
                new_value: json!(receipt.currency),
            },
            AuditFieldChange {
                field: "التاريخ".into(),
                previous_value: Value::Null,
                new_value: json!(receipt.business_date),
            },
            AuditFieldChange {
                field: "ملاحظات".into(),
                previous_value: Value::Null,
                new_value: json!(receipt.notes),
            },
        ],
    )?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(&id))
}

pub fn update(
    connection: &mut Connection,
    id: &str,
    input: ReceiptInput,
) -> RepositoryResult<ReceiptMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|receipt| !receipt.is_deleted)
        .ok_or_else(|| "تعذر العثور على الواصل المطلوب.".to_string())?;
    let receipt = validate(&transaction, input, Some(&original))?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.currency,
        money_minor(original.amount)?,
    )?;
    add_balance(
        &transaction,
        &receipt.customer_id,
        &receipt.currency,
        -receipt.amount_minor,
    )?;
    require_changed(transaction.execute(&format!("UPDATE receipts SET customer_id=?2, customer_name_snapshot=?3, amount_minor=?4, currency=?5, business_date=?6, notes=?7, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, receipt.customer_id, receipt.customer_snapshot, receipt.amount_minor, receipt.currency, receipt.business_date, receipt.notes]).map_err(database_error)?)?;
    let mut changes = Vec::new();
    for item in [
        change(
            "اسم الزبون",
            json!(original.customer_name_snapshot),
            json!(receipt.customer_snapshot),
        ),
        change(
            "المبلغ",
            json!(original.amount),
            json!(receipt.amount_minor as f64 / 100.0),
        ),
        change("العملة", json!(original.currency), json!(receipt.currency)),
        change(
            "التاريخ",
            json!(original.business_date),
            json!(receipt.business_date),
        ),
        change("ملاحظات", json!(original.notes), json!(receipt.notes)),
    ]
    .into_iter()
    .flatten()
    {
        changes.push(item);
    }
    add_history(&transaction, id, "updated", &changes)?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(id))
}

pub fn soft_delete(
    connection: &mut Connection,
    id: &str,
    reason: &str,
) -> RepositoryResult<ReceiptMutation> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("سبب الحذف مطلوب.".into());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|receipt| !receipt.is_deleted)
        .ok_or_else(|| "تعذر العثور على الواصل المطلوب.".to_string())?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.currency,
        money_minor(original.amount)?,
    )?;
    require_changed(transaction.execute(&format!("UPDATE receipts SET is_deleted=1, deleted_at={NOW}, deleted_by=?2, deletion_reason=?3, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, ACTOR, reason]).map_err(database_error)?)?;
    add_history(
        &transaction,
        id,
        "deleted",
        &[AuditFieldChange {
            field: "سبب الحذف".into(),
            previous_value: Value::Null,
            new_value: json!(reason),
        }],
    )?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(id))
}
