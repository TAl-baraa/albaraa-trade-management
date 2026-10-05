use super::{customers, records::*};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, TransactionBehavior, params};
use serde_json::{Value, json};

const ACTOR: &str = "المستخدم الحالي";

struct ValidatedSale {
    customer_id: String,
    customer_snapshot: String,
    product_id: String,
    product_snapshot: String,
    weight_text: String,
    weight_value: f64,
    driver_name: String,
    price_text: String,
    price_value: f64,
    currency: String,
    total_minor: i64,
    sale_date: String,
}

fn parse_positive_decimal(value: &str) -> RepositoryResult<(u128, u32)> {
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
        return Err("القيمة الرقمية غير صالحة.".into());
    }
    let digits = format!("{whole}{fraction}");
    let coefficient = digits
        .parse::<u128>()
        .map_err(|_| "القيمة الرقمية تتجاوز الحد المدعوم.".to_string())?;
    if coefficient == 0 {
        return Err("يجب أن تكون القيمة الرقمية أكبر من صفر.".into());
    }
    Ok((coefficient, fraction.len() as u32))
}

fn calculate_total_minor(weight: &str, price: &str) -> RepositoryResult<i64> {
    let (weight_coefficient, weight_scale) = parse_positive_decimal(weight)?;
    let (price_coefficient, price_scale) = parse_positive_decimal(price)?;
    let product = weight_coefficient
        .checked_mul(price_coefficient)
        .and_then(|value| value.checked_mul(100))
        .ok_or_else(|| "إجمالي البيع يتجاوز الحد المدعوم.".to_string())?;
    let divisor = 10_u128
        .checked_pow(weight_scale + price_scale)
        .ok_or_else(|| "إجمالي البيع يتجاوز الحد المدعوم.".to_string())?;
    let rounded = product
        .checked_add(divisor / 2)
        .ok_or_else(|| "إجمالي البيع يتجاوز الحد المدعوم.".to_string())?
        / divisor;
    if rounded == 0 || rounded > i64::MAX as u128 || rounded > 9_007_199_254_740_991_u128 {
        return Err("إجمالي البيع غير صالح أو يتجاوز الحد المدعوم.".into());
    }
    Ok(rounded as i64)
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

fn linked_name(
    transaction: &Transaction<'_>,
    table: &str,
    id: &str,
    require_active: bool,
) -> RepositoryResult<String> {
    let sql = format!(
        "SELECT name FROM {table} WHERE id=?1{}",
        if require_active {
            " AND is_archived=0"
        } else {
            ""
        }
    );
    transaction
        .query_row(&sql, [id], |row| row.get(0))
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| "تعذر حفظ البيع لأن بيانات الزبون أو المنتج لم تعد متاحة.".into())
}

fn validate(
    transaction: &Transaction<'_>,
    input: SaleInput,
    original: Option<&Sale>,
) -> RepositoryResult<ValidatedSale> {
    if input.sale_currency != "IQD" && input.sale_currency != "USD" {
        return Err("عملة البيع غير صالحة.".into());
    }
    if input.driver_name.trim().is_empty() || !valid_date(transaction, &input.sale_date)? {
        return Err("اسم السائق أو تاريخ البيع غير صالح.".into());
    }
    let total_minor = calculate_total_minor(&input.weight_tons, &input.unit_sale_price)?;
    if money_minor(input.total_amount)? != total_minor || total_minor <= 0 {
        return Err("إجمالي البيع لا يطابق الوزن وسعر البيع.".into());
    }
    let customer_changed = original.is_none_or(|sale| sale.customer_id != input.customer_id);
    let product_changed = original.is_none_or(|sale| sale.product_id != input.product_id);
    let customer_snapshot = if customer_changed {
        linked_name(transaction, "customers", &input.customer_id, true)?
    } else {
        original.unwrap().customer_name_snapshot.clone()
    };
    let product_snapshot = if product_changed {
        linked_name(transaction, "products", &input.product_id, true)?
    } else {
        original.unwrap().product_name_snapshot.clone()
    };
    Ok(ValidatedSale {
        customer_id: input.customer_id,
        customer_snapshot,
        product_id: input.product_id,
        product_snapshot,
        weight_value: input
            .weight_tons
            .trim()
            .parse()
            .map_err(|_| "الوزن غير صالح.")?,
        weight_text: input.weight_tons.trim().to_owned(),
        driver_name: input.driver_name.trim().to_owned(),
        price_value: input
            .unit_sale_price
            .trim()
            .parse()
            .map_err(|_| "سعر البيع غير صالح.")?,
        price_text: input.unit_sale_price.trim().to_owned(),
        currency: input.sale_currency,
        total_minor,
        sale_date: input.sale_date,
    })
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Sale> {
    let weight: String = row.get("weight_tons")?;
    let price: String = row.get("unit_sale_price")?;
    Ok(Sale {
        id: row.get("id")?,
        customer_id: row.get("customer_id")?,
        customer_name_snapshot: row.get("customer_name_snapshot")?,
        product_id: row.get("product_id")?,
        product_name_snapshot: row.get("product_name_snapshot")?,
        weight_tons: weight.parse().map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                weight.len(),
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        driver_name: row.get("driver_name")?,
        unit_sale_price: price.parse().map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                price.len(),
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        sale_currency: row.get("sale_currency")?,
        total_amount: row.get::<_, i64>("total_amount_minor")? as f64 / 100.0,
        sale_date: row.get("sale_date")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        is_reviewed: row.get("is_reviewed")?,
        is_deleted: row.get("is_deleted")?,
        deleted_at: row.get("deleted_at")?,
        deleted_by: row.get("deleted_by")?,
        deletion_reason: row.get("deletion_reason")?,
        history: Vec::new(),
    })
}

fn history(connection: &Connection, sale_id: &str) -> RepositoryResult<Vec<OperationHistoryEntry>> {
    let mut statement = connection.prepare("SELECT id, operation_type, actor, changed_at, changes_json FROM operation_history WHERE sale_id=?1 ORDER BY changed_at, rowid").map_err(database_error)?;
    statement
        .query_map([sale_id], |row| {
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

fn attach_history(connection: &Connection, mut sales: Vec<Sale>) -> RepositoryResult<Vec<Sale>> {
    for sale in &mut sales {
        sale.history = history(connection, &sale.id)?;
    }
    Ok(sales)
}

pub fn list(connection: &Connection, business_date: Option<&str>) -> RepositoryResult<Vec<Sale>> {
    if business_date.is_some_and(|date| !valid_date(connection, date).unwrap_or(false)) {
        return Err("تاريخ العمل غير صالح.".into());
    }
    let mut statement = connection.prepare("SELECT * FROM sales WHERE (?1 IS NULL OR sale_date=?1) ORDER BY created_at DESC, rowid DESC").map_err(database_error)?;
    let sales = statement
        .query_map([business_date], from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)?;
    attach_history(connection, sales)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Sale>> {
    let sale = connection
        .query_row("SELECT * FROM sales WHERE id=?1", [id], from_row)
        .optional()
        .map_err(database_error)?;
    sale.map(|mut value| {
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
        return Err("عملة البيع غير صالحة.".into());
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
    sale_id: &str,
    operation: &str,
    changes: &[AuditFieldChange],
) -> RepositoryResult<()> {
    let id = new_id(transaction, "history")?;
    let encoded =
        serde_json::to_string(changes).map_err(|_| "تعذر حفظ سجل التغييرات.".to_string())?;
    transaction.execute(&format!("INSERT INTO operation_history(id, sale_id, operation_type, actor, changed_at, changes_json) VALUES (?1, ?2, ?3, ?4, {NOW}, ?5)"), params![id, sale_id, operation, ACTOR, encoded]).map_err(database_error)?;
    Ok(())
}

fn change(field: &str, previous: Value, next: Value) -> Option<AuditFieldChange> {
    (previous != next).then(|| AuditFieldChange {
        field: field.into(),
        previous_value: previous,
        new_value: next,
    })
}

fn result(connection: &Connection, sale_id: Option<&str>) -> RepositoryResult<SalesMutation> {
    Ok(SalesMutation {
        sale: sale_id.map(|id| get(connection, id)).transpose()?.flatten(),
        sales: list(connection, None)?,
        customers: customers::list(connection, None)?,
    })
}

pub fn create(connection: &mut Connection, input: SaleInput) -> RepositoryResult<SalesMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let sale = validate(&transaction, input, None)?;
    let id = new_id(&transaction, "sale")?;
    transaction.execute(&format!("INSERT INTO sales(id, customer_id, customer_name_snapshot, product_id, product_name_snapshot, weight_tons, driver_name, unit_sale_price, sale_currency, total_amount_minor, sale_date, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, {NOW}, {NOW})"), params![id, sale.customer_id, sale.customer_snapshot, sale.product_id, sale.product_snapshot, sale.weight_text, sale.driver_name, sale.price_text, sale.currency, sale.total_minor, sale.sale_date]).map_err(database_error)?;
    add_balance(
        &transaction,
        &sale.customer_id,
        &sale.currency,
        sale.total_minor,
    )?;
    add_history(
        &transaction,
        &id,
        "created",
        &[
            AuditFieldChange {
                field: "اسم المشتري".into(),
                previous_value: Value::Null,
                new_value: json!(sale.customer_snapshot),
            },
            AuditFieldChange {
                field: "المنتج".into(),
                previous_value: Value::Null,
                new_value: json!(sale.product_snapshot),
            },
            AuditFieldChange {
                field: "الوزن".into(),
                previous_value: Value::Null,
                new_value: json!(sale.weight_value),
            },
            AuditFieldChange {
                field: "اسم السائق".into(),
                previous_value: Value::Null,
                new_value: json!(sale.driver_name),
            },
            AuditFieldChange {
                field: "سعر بيع الطن".into(),
                previous_value: Value::Null,
                new_value: json!(sale.price_value),
            },
            AuditFieldChange {
                field: "العملة".into(),
                previous_value: Value::Null,
                new_value: json!(sale.currency),
            },
            AuditFieldChange {
                field: "الإجمالي".into(),
                previous_value: Value::Null,
                new_value: json!(sale.total_minor as f64 / 100.0),
            },
            AuditFieldChange {
                field: "التاريخ".into(),
                previous_value: Value::Null,
                new_value: json!(sale.sale_date),
            },
        ],
    )?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(&id))
}

pub fn update(
    connection: &mut Connection,
    id: &str,
    input: SaleInput,
) -> RepositoryResult<SalesMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|sale| !sale.is_deleted)
        .ok_or_else(|| "تعذر العثور على سجل البيع المطلوب تعديله.".to_string())?;
    let sale = validate(&transaction, input, Some(&original))?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.sale_currency,
        -money_minor(original.total_amount)?,
    )?;
    add_balance(
        &transaction,
        &sale.customer_id,
        &sale.currency,
        sale.total_minor,
    )?;
    require_changed(transaction.execute(&format!("UPDATE sales SET customer_id=?2, customer_name_snapshot=?3, product_id=?4, product_name_snapshot=?5, weight_tons=?6, driver_name=?7, unit_sale_price=?8, sale_currency=?9, total_amount_minor=?10, sale_date=?11, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, sale.customer_id, sale.customer_snapshot, sale.product_id, sale.product_snapshot, sale.weight_text, sale.driver_name, sale.price_text, sale.currency, sale.total_minor, sale.sale_date]).map_err(database_error)?)?;
    let mut changes = Vec::new();
    for item in [
        change(
            "اسم المشتري",
            json!(original.customer_name_snapshot),
            json!(sale.customer_snapshot),
        ),
        change(
            "المنتج",
            json!(original.product_name_snapshot),
            json!(sale.product_snapshot),
        ),
        change(
            "الوزن",
            json!(original.weight_tons),
            json!(sale.weight_value),
        ),
        change(
            "اسم السائق",
            json!(original.driver_name),
            json!(sale.driver_name),
        ),
        change(
            "سعر بيع الطن",
            json!(original.unit_sale_price),
            json!(sale.price_value),
        ),
        change(
            "العملة",
            json!(original.sale_currency),
            json!(sale.currency),
        ),
        change(
            "الإجمالي",
            json!(original.total_amount),
            json!(sale.total_minor as f64 / 100.0),
        ),
        change("التاريخ", json!(original.sale_date), json!(sale.sale_date)),
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
) -> RepositoryResult<SalesMutation> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("سبب الحذف مطلوب.".into());
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let original = get(&transaction, id)?
        .filter(|sale| !sale.is_deleted)
        .ok_or_else(|| "تعذر العثور على سجل البيع المطلوب حذفه.".to_string())?;
    add_balance(
        &transaction,
        &original.customer_id,
        &original.sale_currency,
        -money_minor(original.total_amount)?,
    )?;
    require_changed(transaction.execute(&format!("UPDATE sales SET is_deleted=1, deleted_at={NOW}, deleted_by=?2, deletion_reason=?3, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), params![id, ACTOR, reason]).map_err(database_error)?)?;
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

pub fn toggle_reviewed(connection: &mut Connection, id: &str) -> RepositoryResult<SalesMutation> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    require_changed(transaction.execute(&format!("UPDATE sales SET is_reviewed=1-is_reviewed, updated_at={NOW} WHERE id=?1 AND is_deleted=0"), [id]).map_err(database_error)?)?;
    transaction.commit().map_err(database_error)?;
    result(connection, Some(id))
}
