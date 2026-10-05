use super::{customers, initialize, products, records::*};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

struct TestDirectory(PathBuf);
static DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);
impl TestDirectory {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!(
                "albaraa-repositories-{}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            )))
    }
}
impl Drop for TestDirectory {
    fn drop(&mut self) {
        fs::remove_file(self.0.join("albaraa.db")).unwrap();
        fs::remove_dir(&self.0).unwrap();
    }
}
fn customer_input() -> CustomerInput {
    CustomerInput {
        name: "زبون اختبار".into(),
        phone: "07700000000".into(),
        notes: "ملاحظة".into(),
        iqd_balance: 0.0,
        usd_balance: 0.0,
    }
}
fn product_input(name: &str) -> ProductInput {
    ProductInput {
        name: name.into(),
        notes: "ملاحظة المنتج".into(),
    }
}

#[test]
fn customer_lifecycle_and_restart() {
    let directory = TestDirectory::new();
    let connection = initialize(&directory.0).unwrap();
    assert!(customers::list(&connection, None).unwrap().is_empty());
    assert!(customers::get(&connection, "missing").unwrap().is_none());
    let created = customers::save(&connection, None, customer_input()).unwrap();
    let mut input = customer_input();
    input.name = "زبون معدل".into();
    input.iqd_balance = 1500.25;
    input.usd_balance = -20.75;
    let updated = customers::save(&connection, Some(&created.id), input.clone()).unwrap();
    assert_eq!(updated.created_at, created.created_at);
    assert_eq!(
        (updated.iqd_balance, updated.usd_balance),
        (1500.25, -20.75)
    );
    assert!(customers::set_archived(&connection, &created.id, true).is_err());
    assert!(customers::delete(&connection, &created.id).is_err());
    input.iqd_balance = 0.0;
    input.usd_balance = 0.0;
    customers::save(&connection, Some(&created.id), input).unwrap();
    assert!(
        customers::set_archived(&connection, &created.id, true)
            .unwrap()
            .archived_at
            .is_some()
    );
    assert!(
        customers::list(&connection, Some(false))
            .unwrap()
            .is_empty()
    );
    assert_eq!(customers::list(&connection, Some(true)).unwrap().len(), 1);
    assert!(
        !customers::set_archived(&connection, &created.id, false)
            .unwrap()
            .is_archived
    );
    let disposable = customers::save(&connection, None, customer_input()).unwrap();
    customers::delete(&connection, &disposable.id).unwrap();
    assert!(
        customers::get(&connection, &disposable.id)
            .unwrap()
            .is_none()
    );
    drop(connection);
    let connection = initialize(&directory.0).unwrap();
    let retained = customers::get(&connection, &created.id).unwrap().unwrap();
    assert_eq!(retained.name, "زبون معدل");
    assert_eq!(retained.phone, "07700000000");
    assert_eq!(retained.notes, "ملاحظة");
    assert_eq!(customers::list(&connection, Some(false)).unwrap().len(), 1);
}

#[test]
fn product_lifecycle_normalized_uniqueness_and_restart() {
    let directory = TestDirectory::new();
    let connection = initialize(&directory.0).unwrap();
    let columns = connection
        .prepare("PRAGMA table_info(products)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(
        columns,
        [
            "id",
            "name",
            "normalized_name",
            "notes",
            "is_archived",
            "created_at",
            "updated_at"
        ]
    );
    assert!(products::list(&connection, None).unwrap().is_empty());
    assert!(products::get(&connection, "missing").unwrap().is_none());
    let created = products::save(&connection, None, product_input("  ＣＥＭＥＮＴ  ")).unwrap();
    assert!(products::save(&connection, None, product_input("cement")).is_err());
    products::set_archived(&connection, &created.id, true).unwrap();
    assert!(products::save(&connection, None, product_input("CEMENT")).is_err());
    assert!(products::list(&connection, Some(false)).unwrap().is_empty());
    assert_eq!(products::list(&connection, Some(true)).unwrap().len(), 1);
    products::set_archived(&connection, &created.id, false).unwrap();
    let input = product_input("إسمنت معدل");
    let updated = products::save(&connection, Some(&created.id), input).unwrap();
    assert_eq!(updated.created_at, created.created_at);
    let second = products::save(&connection, None, product_input("منتج آخر")).unwrap();
    assert!(products::save(&connection, Some(&second.id), product_input("إسمنت معدل")).is_err());
    let arabic = products::save(&connection, None, product_input("ﻻ")).unwrap();
    assert_eq!(arabic.name, "لا");
    assert!(products::save(&connection, None, product_input("لا")).is_err());
    drop(connection);
    let connection = initialize(&directory.0).unwrap();
    let retained = products::get(&connection, &created.id).unwrap().unwrap();
    assert_eq!(retained.name, "إسمنت معدل");
    assert_eq!(retained.notes, "ملاحظة المنتج");
    assert!(!retained.is_archived);
}

#[test]
fn invalid_values_and_legacy_balance_integrity() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    for invalid in [f64::NAN, f64::INFINITY, 1e20] {
        let mut input = customer_input();
        input.iqd_balance = invalid;
        assert!(customers::save(&connection, None, input).is_err());
    }
    assert!(products::save(&connection, None, product_input("  ")).is_err());
    let customer = customers::save(&connection, None, customer_input()).unwrap();
    let update = |expected: f64, next: f64, history: bool| CustomerBalanceUpdate {
        id: customer.id.clone(),
        expected_iqd_balance: expected,
        expected_usd_balance: 0.0,
        iqd_balance: next,
        usd_balance: 0.0,
        has_transaction_history: history,
    };
    customers::update_balances(&mut connection, vec![update(0.0, 125.5, true)]).unwrap();
    assert!(
        customers::update_balances(
            &mut connection,
            vec![update(125.5, 200.0, true), update(0.0, 300.0, true)]
        )
        .is_err()
    );
    assert_eq!(
        customers::get(&connection, &customer.id)
            .unwrap()
            .unwrap()
            .iqd_balance,
        125.5
    );
    customers::update_balances(&mut connection, vec![update(125.5, 0.0, false)]).unwrap();
    let retained = customers::get(&connection, &customer.id).unwrap().unwrap();
    assert!(retained.has_transaction_history);
    assert_eq!(retained.usd_balance, 0.0);
    assert!(customers::delete(&connection, &customer.id).is_err());
    assert!(customers::set_archived(&connection, &customer.id, true).is_ok());
}
