use rusqlite::{Connection, Row};
use serde::{Deserialize, Serialize};

pub type RepositoryResult<T> = Result<T, String>;
pub const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

pub fn database_error(error: rusqlite::Error) -> String {
    eprintln!("Database operation failed: {error}");
    "تعذر حفظ أو قراءة البيانات. أعد المحاولة.".into()
}

pub fn require_changed(count: usize) -> RepositoryResult<()> {
    if count == 1 {
        Ok(())
    } else {
        Err("السجل غير موجود أو لم يعد يسمح بهذا الإجراء.".into())
    }
}

pub fn new_id(connection: &Connection, prefix: &str) -> RepositoryResult<String> {
    let random: String = connection
        .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
        .map_err(database_error)?;
    Ok(format!("{prefix}-{random}"))
}

pub fn money_minor(value: f64) -> RepositoryResult<i64> {
    let scaled = (value * 100.0 + 0.5).floor();
    if !value.is_finite() || scaled.abs() > 9_007_199_254_740_991.0 {
        return Err("المبلغ غير صالح أو يتجاوز الحد المدعوم.".into());
    }
    Ok(scaled as i64)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomerInput {
    pub name: String,
    pub phone: String,
    pub notes: String,
    pub iqd_balance: f64,
    pub usd_balance: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub phone: String,
    pub notes: String,
    pub iqd_balance: f64,
    pub usd_balance: f64,
    pub last_purchase_date: Option<String>,
    pub last_payment_date: Option<String>,
    pub has_transaction_history: bool,
    pub is_archived: bool,
    pub created_at: String,
    pub archived_at: Option<String>,
}
impl Customer {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            phone: row.get("phone")?,
            notes: row.get("notes")?,
            iqd_balance: row.get::<_, i64>("iqd_balance_minor")? as f64 / 100.0,
            usd_balance: row.get::<_, i64>("usd_balance_minor")? as f64 / 100.0,
            last_purchase_date: row.get("last_purchase_date")?,
            last_payment_date: row.get("last_payment_date")?,
            has_transaction_history: row.get("has_transaction_history")?,
            is_archived: row.get("is_archived")?,
            created_at: row.get("created_at")?,
            archived_at: row.get("archived_at")?,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductInput {
    pub name: String,
    pub notes: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub name: String,
    pub notes: String,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}
impl Product {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            notes: row.get("notes")?,
            is_archived: row.get("is_archived")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuditFieldChange {
    pub field: String,
    pub previous_value: serde_json::Value,
    pub new_value: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OperationHistoryEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub operation_type: String,
    pub actor: String,
    pub changed_at: String,
    pub changes: Vec<AuditFieldChange>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaleInput {
    pub customer_id: String,
    pub product_id: String,
    pub weight_tons: String,
    pub driver_name: String,
    pub unit_sale_price: String,
    pub sale_currency: String,
    pub total_amount: f64,
    pub sale_date: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: String,
    pub customer_id: String,
    pub customer_name_snapshot: String,
    pub product_id: String,
    pub product_name_snapshot: String,
    pub weight_tons: f64,
    pub driver_name: String,
    pub unit_sale_price: f64,
    pub sale_currency: String,
    pub total_amount: f64,
    pub sale_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_reviewed: bool,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
    pub deletion_reason: Option<String>,
    pub history: Vec<OperationHistoryEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalesMutation {
    pub sale: Option<Sale>,
    pub sales: Vec<Sale>,
    pub customers: Vec<Customer>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReceiptInput {
    pub customer_id: String,
    pub amount: String,
    pub currency: String,
    pub business_date: String,
    pub notes: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub customer_id: String,
    pub customer_name_snapshot: String,
    pub amount: f64,
    pub currency: String,
    pub business_date: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub deleted_by: Option<String>,
    pub deletion_reason: Option<String>,
    pub history: Vec<OperationHistoryEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptMutation {
    pub receipt: Option<Receipt>,
    pub receipts: Vec<Receipt>,
    pub customers: Vec<Customer>,
}
