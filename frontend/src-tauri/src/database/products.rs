use super::records::*;
use rusqlite::{Connection, OptionalExtension, params};
use unicode_normalization::UnicodeNormalization;

pub fn normalize_name(name: &str) -> String {
    name.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .nfkc()
        .collect::<String>()
        .to_lowercase()
}

pub fn list(connection: &Connection, archived: Option<bool>) -> RepositoryResult<Vec<Product>> {
    let mut statement = connection.prepare("SELECT * FROM products WHERE (?1 IS NULL OR is_archived = ?1) ORDER BY created_at DESC, rowid DESC").map_err(database_error)?;
    statement
        .query_map([archived], Product::from_row)
        .map_err(database_error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(database_error)
}

pub fn get(connection: &Connection, id: &str) -> RepositoryResult<Option<Product>> {
    connection
        .query_row(
            "SELECT * FROM products WHERE id=?1",
            [id],
            Product::from_row,
        )
        .optional()
        .map_err(database_error)
}

pub fn save(
    connection: &Connection,
    id: Option<&str>,
    input: ProductInput,
) -> RepositoryResult<Product> {
    let normalized = normalize_name(&input.name);
    if normalized.is_empty() {
        return Err("اسم المنتج مطلوب.".into());
    }
    let record_id = match id {
        Some(value) => value.to_owned(),
        None => new_id(connection, "product")?,
    };
    let count = if id.is_some() {
        connection.execute(&format!("UPDATE products SET name=?2, normalized_name=?3, notes=?4, updated_at={NOW} WHERE id=?1"), params![record_id, input.name.trim().nfkc().collect::<String>(), normalized, input.notes.trim()])
    } else {
        connection.execute(&format!("INSERT INTO products(id, name, normalized_name, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, {NOW}, {NOW})"), params![record_id, input.name.trim().nfkc().collect::<String>(), normalized, input.notes.trim()])
    }.map_err(|error| match &error {
        rusqlite::Error::SqliteFailure(code, _) if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE => "اسم المنتج مستخدم لمنتج آخر.".into(),
        _ => database_error(error),
    })?;
    require_changed(count)?;
    get(connection, &record_id)?.ok_or_else(|| "المنتج غير موجود.".into())
}

pub fn set_archived(
    connection: &Connection,
    id: &str,
    archived: bool,
) -> RepositoryResult<Product> {
    require_changed(
        connection
            .execute(
                &format!("UPDATE products SET is_archived=?2, updated_at={NOW} WHERE id=?1"),
                params![id, archived],
            )
            .map_err(database_error)?,
    )?;
    get(connection, id)?.ok_or_else(|| "المنتج غير موجود.".into())
}
