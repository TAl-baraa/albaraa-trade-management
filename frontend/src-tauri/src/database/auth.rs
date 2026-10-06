use super::records::{NOW, RepositoryResult, database_error};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};

const MIN_PASSWORD_LENGTH: usize = 8;
const LOGIN_ERROR: &str = "اسم المستخدم أو كلمة المرور غير صحيحة.";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub has_account: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub username: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateAccountInput {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangePasswordInput {
    pub current_password: String,
    pub new_password: String,
}

fn validate_username(username: &str) -> RepositoryResult<&str> {
    let username = username.trim();
    if username.is_empty() {
        Err("اسم المستخدم مطلوب.".into())
    } else {
        Ok(username)
    }
}

fn validate_password(password: &str) -> RepositoryResult<()> {
    if password.is_empty() {
        Err("كلمة المرور مطلوبة.".into())
    } else if password.chars().count() < MIN_PASSWORD_LENGTH {
        Err(format!(
            "يجب ألا تقل كلمة المرور عن {MIN_PASSWORD_LENGTH} أحرف."
        ))
    } else {
        Ok(())
    }
}

fn hash_password(password: &str) -> RepositoryResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| {
            eprintln!("Password hashing failed: {error}");
            "تعذر حفظ كلمة المرور. أعد المحاولة.".into()
        })
}

fn verify_password(password: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded).ok().is_some_and(|hash| {
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok()
    })
}

pub fn status(connection: &Connection) -> RepositoryResult<AuthStatus> {
    let count: i64 = connection
        .query_row("SELECT count(*) FROM local_user", [], |row| row.get(0))
        .map_err(database_error)?;
    Ok(AuthStatus {
        has_account: count == 1,
    })
}

pub fn create_first(
    connection: &mut Connection,
    input: CreateAccountInput,
) -> RepositoryResult<AuthSession> {
    let username = validate_username(&input.username)?.to_owned();
    validate_password(&input.password)?;
    let password_hash = hash_password(&input.password)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let count: i64 = transaction
        .query_row("SELECT count(*) FROM local_user", [], |row| row.get(0))
        .map_err(database_error)?;
    if count != 0 {
        return Err("تم إعداد الحساب المحلي مسبقًا.".into());
    }
    transaction.execute(&format!("INSERT INTO local_user(id, username, password_hash, created_at, updated_at) VALUES (1, ?1, ?2, {NOW}, {NOW})"), params![username, password_hash]).map_err(database_error)?;
    transaction.commit().map_err(database_error)?;
    Ok(AuthSession { username })
}

pub fn login(connection: &Connection, input: LoginInput) -> RepositoryResult<AuthSession> {
    let record: Option<(String, String)> = connection
        .query_row(
            "SELECT username, password_hash FROM local_user WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let Some((username, password_hash)) = record else {
        return Err(LOGIN_ERROR.into());
    };
    if username != input.username.trim() || !verify_password(&input.password, &password_hash) {
        return Err(LOGIN_ERROR.into());
    }
    Ok(AuthSession { username })
}

pub fn change_password(
    connection: &mut Connection,
    input: ChangePasswordInput,
) -> RepositoryResult<()> {
    validate_password(&input.new_password)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let current_hash: Option<String> = transaction
        .query_row(
            "SELECT password_hash FROM local_user WHERE id=1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    let Some(current_hash) = current_hash else {
        return Err("لم يتم إعداد الحساب المحلي بعد.".into());
    };
    if !verify_password(&input.current_password, &current_hash) {
        return Err("كلمة المرور الحالية غير صحيحة.".into());
    }
    let password_hash = hash_password(&input.new_password)?;
    transaction
        .execute(
            &format!("UPDATE local_user SET password_hash=?1, updated_at={NOW} WHERE id=1"),
            [password_hash],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)
}
