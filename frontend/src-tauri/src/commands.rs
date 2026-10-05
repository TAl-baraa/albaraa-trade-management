use crate::database::{self, customers, products, records::*};
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
pub fn update_customer_balances(
    state: State<'_, DatabaseDirectory>,
    updates: Vec<CustomerBalanceUpdate>,
) -> RepositoryResult<()> {
    customers::update_balances(&mut connect(&state)?, updates)
}
