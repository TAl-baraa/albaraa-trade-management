use crate::database::{self, customers, products, receipts, records::*, sales};
use std::path::PathBuf;
use tauri::State;

pub struct DatabaseDirectory(pub PathBuf);
fn connect(state: &DatabaseDirectory) -> RepositoryResult<rusqlite::Connection> {
    database::initialize(&state.0).map_err(|error| {
        eprintln!("Database connection failed: {error}");
        "تعذر الاتصال بقاعدة البيانات.".into()
    })
}

#[tauri::command]
pub fn list_customers(
    state: State<'_, DatabaseDirectory>,
    archived: Option<bool>,
) -> RepositoryResult<Vec<Customer>> {
    customers::list(&connect(&state)?, archived)
}
#[tauri::command]
pub fn get_customer(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Option<Customer>> {
    customers::get(&connect(&state)?, &id)
}
#[tauri::command]
pub fn create_customer(
    state: State<'_, DatabaseDirectory>,
    input: CustomerInput,
) -> RepositoryResult<Customer> {
    customers::save(&connect(&state)?, None, input)
}
#[tauri::command]
pub fn update_customer(
    state: State<'_, DatabaseDirectory>,
    id: String,
    input: CustomerInput,
) -> RepositoryResult<Customer> {
    customers::save(&connect(&state)?, Some(&id), input)
}
#[tauri::command]
pub fn archive_customer(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Customer> {
    customers::set_archived(&connect(&state)?, &id, true)
}
#[tauri::command]
pub fn reactivate_customer(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Customer> {
    customers::set_archived(&connect(&state)?, &id, false)
}

#[tauri::command]
pub fn list_products(
    state: State<'_, DatabaseDirectory>,
    archived: Option<bool>,
) -> RepositoryResult<Vec<Product>> {
    products::list(&connect(&state)?, archived)
}
#[tauri::command]
pub fn get_product(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Option<Product>> {
    products::get(&connect(&state)?, &id)
}
#[tauri::command]
pub fn create_product(
    state: State<'_, DatabaseDirectory>,
    input: ProductInput,
) -> RepositoryResult<Product> {
    products::save(&connect(&state)?, None, input)
}
#[tauri::command]
pub fn update_product(
    state: State<'_, DatabaseDirectory>,
    id: String,
    input: ProductInput,
) -> RepositoryResult<Product> {
    products::save(&connect(&state)?, Some(&id), input)
}
#[tauri::command]
pub fn archive_product(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Product> {
    products::set_archived(&connect(&state)?, &id, true)
}
#[tauri::command]
pub fn reactivate_product(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Product> {
    products::set_archived(&connect(&state)?, &id, false)
}

#[tauri::command]
pub fn delete_customer(state: State<'_, DatabaseDirectory>, id: String) -> RepositoryResult<()> {
    customers::delete(&connect(&state)?, &id)
}
#[tauri::command]
pub fn list_sales(state: State<'_, DatabaseDirectory>) -> RepositoryResult<Vec<Sale>> {
    sales::list(&connect(&state)?, None)
}

#[tauri::command]
pub fn list_sales_by_business_date(
    state: State<'_, DatabaseDirectory>,
    business_date: String,
) -> RepositoryResult<Vec<Sale>> {
    sales::list(&connect(&state)?, Some(&business_date))
}

#[tauri::command]
pub fn get_sale(state: State<'_, DatabaseDirectory>, id: String) -> RepositoryResult<Option<Sale>> {
    sales::get(&connect(&state)?, &id)
}

#[tauri::command]
pub fn create_sale(
    state: State<'_, DatabaseDirectory>,
    input: SaleInput,
) -> RepositoryResult<SalesMutation> {
    sales::create(&mut connect(&state)?, input)
}

#[tauri::command]
pub fn update_sale(
    state: State<'_, DatabaseDirectory>,
    id: String,
    input: SaleInput,
) -> RepositoryResult<SalesMutation> {
    sales::update(&mut connect(&state)?, &id, input)
}

#[tauri::command]
pub fn soft_delete_sale(
    state: State<'_, DatabaseDirectory>,
    id: String,
    reason: String,
) -> RepositoryResult<SalesMutation> {
    sales::soft_delete(&mut connect(&state)?, &id, &reason)
}

#[tauri::command]
pub fn toggle_sale_reviewed(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<SalesMutation> {
    sales::toggle_reviewed(&mut connect(&state)?, &id)
}

#[tauri::command]
pub fn list_receipts(state: State<'_, DatabaseDirectory>) -> RepositoryResult<Vec<Receipt>> {
    receipts::list(&connect(&state)?, None)
}

#[tauri::command]
pub fn list_receipts_by_business_date(
    state: State<'_, DatabaseDirectory>,
    business_date: String,
) -> RepositoryResult<Vec<Receipt>> {
    receipts::list(&connect(&state)?, Some(&business_date))
}

#[tauri::command]
pub fn get_receipt(
    state: State<'_, DatabaseDirectory>,
    id: String,
) -> RepositoryResult<Option<Receipt>> {
    receipts::get(&connect(&state)?, &id)
}

#[tauri::command]
pub fn create_receipt(
    state: State<'_, DatabaseDirectory>,
    input: ReceiptInput,
) -> RepositoryResult<ReceiptMutation> {
    receipts::create(&mut connect(&state)?, input)
}

#[tauri::command]
pub fn update_receipt(
    state: State<'_, DatabaseDirectory>,
    id: String,
    input: ReceiptInput,
) -> RepositoryResult<ReceiptMutation> {
    receipts::update(&mut connect(&state)?, &id, input)
}

#[tauri::command]
pub fn soft_delete_receipt(
    state: State<'_, DatabaseDirectory>,
    id: String,
    reason: String,
) -> RepositoryResult<ReceiptMutation> {
    receipts::soft_delete(&mut connect(&state)?, &id, &reason)
}
