use super::{customers, records::*};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, TransactionBehavior, params};
use serde_json::{Value, json};

const ACTOR: &str = "المستخدم الحالي";

struct ValidatedTransfer {
    customer_id: String,
    customer_snapshot: String,
    amount_minor: i64,
    currency: String,
    business_date: String,
    description: String,
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
        return Err("مبلغ الحوالة غير صالح.".into());
    }
    let coefficient = format!("{whole}{fraction}")
        .parse::<u128>()
        .map_err(|_| "مبلغ الحوالة يتجاوز الحد المدعوم.".to_string())?;
    let divisor = 10_u128
        .checked_pow(fraction.len() as u32)
        .ok_or_else(|| "مبلغ الحوالة يتجاوز الحد المدعوم.".to_string())?;
    let minor = coefficient
        .checked_mul(100)
        .and_then(|amount| amount.checked_add(divisor / 2))
        .ok_or_else(|| "مبلغ الحوالة يتجاوز الحد المدعوم.".to_string())?
        / divisor;
    if minor == 0 || minor > 9_007_199_254_740_991_u128 || minor > i64::MAX as u128 {
        return Err("يجب أن يكون مبلغ الحوالة أكبر من صفر وضمن الحد المدعوم.".into());
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
    input: TransferInput,
    original: Option<&Transfer>,
) -> RepositoryResult<ValidatedTransfer> {
    if input.currency != "IQD" && input.currency != "USD" {
        return Err("عملة الحوالة غير صالحة.".into());
    }
    if !valid_date(transaction, &input.business_date)? {
        return Err("تاريخ الحوالة غير صالح.".into());
    }
    let description = input.description.trim().to_owned();
    if description.is_empty() {
        return Err("بيان الحوالة مطلوب.".into());
    }
    let customer_changed =
        original.is_none_or(|transfer| transfer.customer_id != input.customer_id);
    let customer_snapshot = if customer_changed {
        transaction
            .query_row(
                "SELECT name FROM customers WHERE id=?1 AND is_archived=0",
                [&input.customer_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?
            .ok_or_else(|| "تعذر حفظ الحوالة لأن بيانات الزبون لم تعد متاحة.".to_string())?
    } else {
        original.unwrap().customer_name_snapshot.clone()
    };
    Ok(ValidatedTransfer {
        customer_id: input.customer_id,
        customer_snapshot,
        amount_minor: positive_amount_minor(&input.amount)?,
        currency: input.currency,
        business_date: input.business_date,
        description,
        notes: input.notes.trim().to_owned(),
    })
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Transfer> {
    Ok(Transfer {
        id: row.get("id")?,
        customer_id: row.get("customer_id")?,
        customer_name_snapshot: row.get("customer_name_snapshot")?,
        amount: row.get::<_, i64>("amount_minor")? as f64 / 100.0,
        currency: row.get("currency")?,
        business_date: row.get("business_date")?,
        description: row.get("description")?,
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
    transfer_id: &str,
) -> RepositoryResult<Vec<OperationHistoryEntry>> {
    let mut statement = connection.prepare("SELECT id, operation_type, actor, changed_at, changes_json FROM operation_history WHERE transfer_id=?1 ORDER BY changed_at, rowid").map_err(database_error)?;
    statement
        .query_map([transfer_id], |row| {
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
    mut transfers: Vec<Transfer>,
) -> RepositoryResult<Vec<Transfer>> {
    for transfer in &mut transfers {
        transfer.history = history(connection, &transfer.id)?;
    }
    Ok(transfers)
}

pub fn list(
    connection: &Connection,
    business_date: Option<&str>,
) -> RepositoryResult<Vec<Transfer>> {
    if business_date.is_some_and(|date| !valid_date(connection, date).unwrap_or(false)) {
        return Err("تاريخ العمل غير صالح.".into());
    }
    let mut statement = connection.prepare("SELECT * FROM transfers WHERE (?1 IS NULL OR business_date=?1) ORDER BY created_at DESC, rowid DESC").map_err(database_error)?;
    let transfers = statement
        .query_map([business_date], from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    attach_history(connection, transfers)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Transfer>> {
    let transfer = connection
        .query_row("SELECT * FROM transfers WHERE id=?1", [id], from_row)
        .optional()
        .map_err(database_error)?;
    transfer
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
        return Err("عملة الحوالة غير صالحة.".into());
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
    transfer_id: &str,
    operation: &str,
    changes: &[AuditFieldChange],
) -> RepositoryResult<()> {
    let id = new_id(transaction, "history")?;
    let encoded =
        serde_json::to_string(changes).map_err(|_| "تعذر حفظ سجل التغييرات.".to_string())?;
    transaction.execute(&format!("INSERT INTO operation_history(id, transfer_id, operation_type, actor, changed_at, changes_json) VALUES (?1, ?2, ?3, ?4, {NOW}, ?5)"), params![id, transfer_id, operation, ACTOR, encoded]).map_err(database_error)?;
    Ok(())
}

fn change(field: &str, previous: Value, next: Value) -> Option<AuditFieldChange> {
    (previous != next).then(|| AuditFieldChange {
        field: field.into(),
        previous_value: previous,
        new_value: next,
    })
}

fn result(
    connection: &Connection,
    transfer_id: Option<&str>,
) -> RepositoryResult<TransferMutation> {
    Ok(TransferMutation {
        transfer: transfer_id
            .map(|id| get(connection, id))
            .transpose()?
            .flatten(),
        transfers: list(connection, None)?,
        customers: customers::list(connection, None)?,
    })
}

pub fn create(
    connection: &mut Connection,
    input: TransferInput,
) -> RepositoryResult<TransferMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let transfer = validate(&transaction, input, None)?;
    let id = new_id(&transaction, "transfer")?;
    transaction.execute(&format!("INSERT INTO transfers(id, customer_id, customer_name_snapshot, amount_minor, currency, business_date, description, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, {NOW}, {NOW})"), params![id, transfer.customer_id, transfer.customer_snapshot, transfer.amount_minor, transfer.currency, transfer.business_date, transfer.description, transfer.notes]).map_err(database_error)?;
    add_balance(
        &transaction,
        &transfer.customer_id,
        &transfer.currency,
        transfer.amount_minor,
    )?;
    add_history(
        &transaction,
        &id,
        "created",
        &[
            AuditFieldChange {
                field: "اسم الزبون".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.customer_snapshot),
            },
            AuditFieldChange {
                field: "المبلغ".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.amount_minor as f64 / 100.0),
            },
            AuditFieldChange {
                field: "العملة".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.currency),
            },
            AuditFieldChange {
                field: "التاريخ".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.business_date),
            },
            AuditFieldChange {
                field: "البيان".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.description),
            },
            AuditFieldChange {
                field: "ملاحظات".into(),
                previous_value: Value::Null,
                new_value: json!(transfer.notes),
            },
        ],
    )?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(&id))
}

pub fn update(
    connection: &mut Connection,
    id: &str,
    input: TransferInput,
) -> RepositoryResult<TransferMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|transfer| !transfer.is_deleted)
        .ok_or_else(|| "تعذر العثور على الحوالة المطلوب.".to_string())?;
    let transfer = validate(&transaction, input, Some(&original))?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.currency,
        -money_minor(original.amount)?,
    )?;
    add_balance(
        &transaction,
        &transfer.customer_id,
        &transfer.currency,
        transfer.amount_minor,
    )?;
    require_changed(transaction.execute(&format!("UPDATE transfers SET customer_id=?2, customer_name_snapshot=?3, amount_minor=?4, currency=?5, business_date=?6, description=?7, notes=?8, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, transfer.customer_id, transfer.customer_snapshot, transfer.amount_minor, transfer.currency, transfer.business_date, transfer.description, transfer.notes]).map_err(database_error)?)?;
    let mut changes = Vec::new();
    for item in [
        change(
            "اسم الزبون",
            json!(original.customer_name_snapshot),
            json!(transfer.customer_snapshot),
        ),
        change(
            "المبلغ",
            json!(original.amount),
            json!(transfer.amount_minor as f64 / 100.0),
        ),
        change("العملة", json!(original.currency), json!(transfer.currency)),
        change(
            "التاريخ",
            json!(original.business_date),
            json!(transfer.business_date),
        ),
        change(
            "البيان",
            json!(original.description),
            json!(transfer.description),
        ),
        change("ملاحظات", json!(original.notes), json!(transfer.notes)),
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
) -> RepositoryResult<TransferMutation> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("سبب الحذف مطلوب.".into());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|transfer| !transfer.is_deleted)
        .ok_or_else(|| "تعذر العثور على الحوالة المطلوب.".to_string())?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.currency,
        -money_minor(original.amount)?,
    )?;
    require_changed(transaction.execute(&format!("UPDATE transfers SET is_deleted=1, deleted_at={NOW}, deleted_by=?2, deletion_reason=?3, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, ACTOR, reason]).map_err(database_error)?)?;
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
