use super::{auth, customers, initialize, products, receipts, records::*, sales, transfers};
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

fn sale_input(
    customer_id: &str,
    product_id: &str,
    weight: &str,
    price: &str,
    currency: &str,
) -> SaleInput {
    SaleInput {
        customer_id: customer_id.into(),
        product_id: product_id.into(),
        weight_tons: weight.into(),
        driver_name: "سائق الاختبار".into(),
        unit_sale_price: price.into(),
        sale_currency: currency.into(),
        total_amount: {
            let weight: f64 = weight.parse().unwrap();
            let price: f64 = price.parse().unwrap();
            (weight * price * 100.0).round() / 100.0
        },
        sale_date: "2026-10-05".into(),
    }
}

fn receipt_input(customer_id: &str, amount: &str, currency: &str) -> ReceiptInput {
    ReceiptInput {
        customer_id: customer_id.into(),
        amount: amount.into(),
        currency: currency.into(),
        business_date: "2026-10-05".into(),
        notes: "ملاحظة الواصل".into(),
    }
}

fn transfer_input(customer_id: &str, amount: &str, currency: &str) -> TransferInput {
    TransferInput {
        customer_id: customer_id.into(),
        amount: amount.into(),
        currency: currency.into(),
        business_date: "2026-10-05".into(),
        description: "حوالة اختبار".into(),
        notes: "ملاحظة الحوالة".into(),
    }
}

#[test]
fn transfers_atomic_lifecycle_snapshots_history_and_restart() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    assert!(transfers::list(&connection, None).unwrap().is_empty());
    let first = customers::save(&connection, None, customer_input()).unwrap();
    let mut second_input = customer_input();
    second_input.name = "زبون ثانٍ".into();
    let second = customers::save(&connection, None, second_input).unwrap();

    let iqd = transfers::create(&mut connection, transfer_input(&first.id, "100", "IQD"))
        .unwrap()
        .transfer
        .unwrap();
    let usd = transfers::create(&mut connection, transfer_input(&first.id, "20", "USD"))
        .unwrap()
        .transfer
        .unwrap();
    assert_eq!(balances(&connection, &first.id), (10_000, 2_000));
    assert_eq!(iqd.history.len(), 1);

    let mut edited = transfer_input(&first.id, "150", "USD");
    edited.business_date = "2026-10-06".into();
    edited.description = "بيان معدل".into();
    edited.notes = "ملاحظات معدلة".into();
    let edited = transfers::update(&mut connection, &iqd.id, edited)
        .unwrap()
        .transfer
        .unwrap();
    assert_eq!(balances(&connection, &first.id), (0, 17_000));
    assert_eq!(edited.customer_name_snapshot, first.name);
    assert_eq!(edited.description, "بيان معدل");

    let changed = transfers::update(
        &mut connection,
        &iqd.id,
        transfer_input(&second.id, "50", "IQD"),
    )
    .unwrap()
    .transfer
    .unwrap();
    assert_eq!(changed.customer_name_snapshot, second.name);
    assert_eq!(balances(&connection, &first.id), (0, 2_000));
    assert_eq!(balances(&connection, &second.id), (5_000, 0));

    let deleted = transfers::soft_delete(&mut connection, &iqd.id, "اختبار الحذف")
        .unwrap()
        .transfer
        .unwrap();
    assert!(deleted.is_deleted);
    assert_eq!(balances(&connection, &second.id), (0, 0));
    assert!(customers::delete(&connection, &second.id).is_err());

    let mut archived_input = customer_input();
    archived_input.name = "زبون مؤرشف".into();
    let archived = customers::save(&connection, None, archived_input).unwrap();
    let archived_transfer =
        transfers::create(&mut connection, transfer_input(&archived.id, "10", "IQD"))
            .unwrap()
            .transfer
            .unwrap();
    receipts::create(&mut connection, receipt_input(&archived.id, "10", "IQD")).unwrap();
    customers::set_archived(&connection, &archived.id, true).unwrap();
    let mut historical_edit = transfer_input(&archived.id, "10", "IQD");
    historical_edit.notes = "تعديل مرجع مؤرشف".into();
    let historical = transfers::update(&mut connection, &archived_transfer.id, historical_edit)
        .unwrap()
        .transfer
        .unwrap();
    assert_eq!(historical.customer_name_snapshot, archived.name);
    assert_eq!(balances(&connection, &archived.id), (0, 0));

    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    let foreign_keys: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(integrity, "ok");
    assert_eq!(foreign_keys, 0);
    drop(connection);
    let connection = initialize(&directory.0).unwrap();
    assert_eq!(transfers::list(&connection, None).unwrap().len(), 3);
    assert_eq!(
        transfers::get(&connection, &usd.id)
            .unwrap()
            .unwrap()
            .amount,
        20.0
    );
}

#[test]
fn transfer_failures_roll_back_record_balance_and_history() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    let customer = customers::save(&connection, None, customer_input()).unwrap();
    assert!(transfers::create(&mut connection, transfer_input("missing", "10", "IQD")).is_err());
    let mut invalid = transfer_input(&customer.id, "10", "IQD");
    invalid.description = " ".into();
    assert!(transfers::create(&mut connection, invalid).is_err());
    connection.execute_batch("CREATE TRIGGER fail_transfer_history BEFORE INSERT ON operation_history WHEN NEW.transfer_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test rollback'); END;").unwrap();
    assert!(transfers::create(&mut connection, transfer_input(&customer.id, "25", "IQD")).is_err());
    assert!(transfers::list(&connection, None).unwrap().is_empty());
    assert_eq!(balances(&connection, &customer.id), (0, 0));
    connection
        .execute_batch("DROP TRIGGER fail_transfer_history;")
        .unwrap();
    let created = transfers::create(&mut connection, transfer_input(&customer.id, "25", "IQD"))
        .unwrap()
        .transfer
        .unwrap();
    connection.execute_batch("CREATE TRIGGER fail_transfer_update BEFORE INSERT ON operation_history WHEN NEW.transfer_id IS NOT NULL AND NEW.operation_type='updated' BEGIN SELECT RAISE(ABORT, 'test rollback'); END;").unwrap();
    assert!(
        transfers::update(
            &mut connection,
            &created.id,
            transfer_input(&customer.id, "40", "USD")
        )
        .is_err()
    );
    let unchanged = transfers::get(&connection, &created.id).unwrap().unwrap();
    assert_eq!(unchanged.amount, 25.0);
    assert_eq!(unchanged.history.len(), 1);
    assert_eq!(balances(&connection, &customer.id), (2_500, 0));
}

fn balances(connection: &rusqlite::Connection, customer_id: &str) -> (i64, i64) {
    connection
        .query_row(
            "SELECT iqd_balance_minor, usd_balance_minor FROM customers WHERE id=?1",
            [customer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap()
}

fn create_account_input(username: &str, password: &str) -> auth::CreateAccountInput {
    auth::CreateAccountInput {
        username: username.into(),
        password: password.into(),
    }
}

fn login_input(username: &str, password: &str) -> auth::LoginInput {
    auth::LoginInput {
        username: username.into(),
        password: password.into(),
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
fn invalid_customer_and_product_values_are_rejected() {
    let directory = TestDirectory::new();
    let connection = initialize(&directory.0).unwrap();
    for invalid in [f64::NAN, f64::INFINITY, 1e20] {
        let mut input = customer_input();
        input.iqd_balance = invalid;
        assert!(customers::save(&connection, None, input).is_err());
    }
    assert!(products::save(&connection, None, product_input("  ")).is_err());
}

#[test]
fn sales_atomic_lifecycle_snapshots_and_restart() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    assert!(sales::list(&connection, None).unwrap().is_empty());

    let first_customer = customers::save(&connection, None, customer_input()).unwrap();
    let mut second_customer_input = customer_input();
    second_customer_input.name = "زبون ثانٍ".into();
    let second_customer = customers::save(&connection, None, second_customer_input).unwrap();
    let first_product = products::save(&connection, None, product_input("منتج أول")).unwrap();
    let second_product = products::save(&connection, None, product_input("منتج ثانٍ")).unwrap();

    let created_iqd = sales::create(
        &mut connection,
        sale_input(&first_customer.id, &first_product.id, "2", "100", "IQD"),
    )
    .unwrap()
    .sale
    .unwrap();
    assert_eq!(created_iqd.total_amount, 200.0);
    assert_eq!(balances(&connection, &first_customer.id), (20_000, 0));
    assert_eq!(created_iqd.history.len(), 1);
    assert_eq!(created_iqd.history[0].operation_type, "created");

    let created_usd = sales::create(
        &mut connection,
        sale_input(&first_customer.id, &first_product.id, "1.5", "10", "USD"),
    )
    .unwrap()
    .sale
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (20_000, 1_500));

    let changed_amount = sales::update(
        &mut connection,
        &created_iqd.id,
        sale_input(&first_customer.id, &first_product.id, "3", "100", "IQD"),
    )
    .unwrap()
    .sale
    .unwrap();
    assert_eq!(changed_amount.total_amount, 300.0);
    assert_eq!(balances(&connection, &first_customer.id), (30_000, 1_500));

    sales::update(
        &mut connection,
        &created_iqd.id,
        sale_input(&first_customer.id, &first_product.id, "3", "100", "USD"),
    )
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (0, 31_500));

    let changed_links = sales::update(
        &mut connection,
        &created_iqd.id,
        sale_input(&second_customer.id, &second_product.id, "3", "100", "USD"),
    )
    .unwrap()
    .sale
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (0, 1_500));
    assert_eq!(balances(&connection, &second_customer.id), (0, 30_000));
    assert_eq!(changed_links.customer_name_snapshot, "زبون ثانٍ");
    assert_eq!(changed_links.product_name_snapshot, "منتج ثانٍ");

    let mut renamed_customer = customer_input();
    renamed_customer.name = "اسم زبون جديد".into();
    renamed_customer.usd_balance = 300.0;
    customers::save(&connection, Some(&second_customer.id), renamed_customer).unwrap();
    products::save(
        &connection,
        Some(&second_product.id),
        product_input("اسم منتج جديد"),
    )
    .unwrap();
    let mut unrelated = sale_input(&second_customer.id, &second_product.id, "3", "100", "USD");
    unrelated.driver_name = "سائق جديد".into();
    unrelated.sale_date = "2026-10-06".into();
    let stable_snapshots = sales::update(&mut connection, &created_iqd.id, unrelated)
        .unwrap()
        .sale
        .unwrap();
    assert_eq!(stable_snapshots.customer_name_snapshot, "زبون ثانٍ");
    assert_eq!(stable_snapshots.product_name_snapshot, "منتج ثانٍ");
    assert_eq!(
        sales::list(&connection, Some("2026-10-06")).unwrap().len(),
        1
    );

    let deleted = sales::soft_delete(&mut connection, &created_iqd.id, "اختبار الحذف")
        .unwrap()
        .sale
        .unwrap();
    assert!(deleted.is_deleted);
    assert_eq!(deleted.deletion_reason.as_deref(), Some("اختبار الحذف"));
    assert_eq!(balances(&connection, &second_customer.id), (0, 0));
    assert_eq!(deleted.history.last().unwrap().operation_type, "deleted");
    assert_eq!(balances(&connection, &first_customer.id), (0, 1_500));

    let reviewed = sales::toggle_reviewed(&mut connection, &created_usd.id)
        .unwrap()
        .sale
        .unwrap();
    assert!(reviewed.is_reviewed);
    assert!(sales::toggle_reviewed(&mut connection, &created_iqd.id).is_err());

    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let foreign_key_violations: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(foreign_key_violations, 0);
    drop(connection);

    let connection = initialize(&directory.0).unwrap();
    let persisted = sales::get(&connection, &created_iqd.id).unwrap().unwrap();
    assert!(persisted.is_deleted);
    assert_eq!(sales::list(&connection, None).unwrap().len(), 2);
    assert_eq!(balances(&connection, &first_customer.id), (0, 1_500));
    assert_eq!(balances(&connection, &second_customer.id), (0, 0));
}

#[test]
fn sale_failures_roll_back_record_balance_and_history() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    let customer = customers::save(&connection, None, customer_input()).unwrap();
    let product = products::save(&connection, None, product_input("منتج")).unwrap();

    let mut inconsistent = sale_input(&customer.id, &product.id, "2", "10", "IQD");
    inconsistent.total_amount = 19.0;
    assert!(sales::create(&mut connection, inconsistent).is_err());
    assert!(
        sales::create(
            &mut connection,
            sale_input(&customer.id, "missing", "2", "10", "IQD")
        )
        .is_err()
    );
    assert!(sales::list(&connection, None).unwrap().is_empty());
    assert_eq!(balances(&connection, &customer.id), (0, 0));

    connection.execute_batch("CREATE TRIGGER fail_sale_history BEFORE INSERT ON operation_history WHEN NEW.sale_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test rollback'); END;").unwrap();
    assert!(
        sales::create(
            &mut connection,
            sale_input(&customer.id, &product.id, "2", "10", "IQD")
        )
        .is_err()
    );
    assert!(sales::list(&connection, None).unwrap().is_empty());
    assert_eq!(balances(&connection, &customer.id), (0, 0));
    let history_count: i64 = connection
        .query_row("SELECT count(*) FROM operation_history", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(history_count, 0);

    connection
        .execute_batch("DROP TRIGGER fail_sale_history;")
        .unwrap();
    let created = sales::create(
        &mut connection,
        sale_input(&customer.id, &product.id, "2", "10", "IQD"),
    )
    .unwrap()
    .sale
    .unwrap();
    connection.execute_batch("CREATE TRIGGER fail_sale_update_history BEFORE INSERT ON operation_history WHEN NEW.operation_type = 'updated' BEGIN SELECT RAISE(ABORT, 'test update rollback'); END;").unwrap();
    assert!(
        sales::update(
            &mut connection,
            &created.id,
            sale_input(&customer.id, &product.id, "3", "10", "IQD")
        )
        .is_err()
    );
    let unchanged = sales::get(&connection, &created.id).unwrap().unwrap();
    assert_eq!(unchanged.total_amount, 20.0);
    assert_eq!(unchanged.history.len(), 1);
    assert_eq!(balances(&connection, &customer.id), (2_000, 0));
}

#[test]
fn receipts_atomic_lifecycle_overpayment_snapshots_and_restart() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    assert!(receipts::list(&connection, None).unwrap().is_empty());

    let mut first_input = customer_input();
    first_input.iqd_balance = 100.0;
    first_input.usd_balance = 50.0;
    let first_customer = customers::save(&connection, None, first_input).unwrap();
    let mut second_input = customer_input();
    second_input.name = "زبون الواصل الثاني".into();
    let second_customer = customers::save(&connection, None, second_input).unwrap();

    let created_iqd = receipts::create(
        &mut connection,
        receipt_input(&first_customer.id, "125", "IQD"),
    )
    .unwrap()
    .receipt
    .unwrap();
    assert_eq!(created_iqd.amount, 125.0);
    assert_eq!(balances(&connection, &first_customer.id), (-2_500, 5_000));
    assert_eq!(created_iqd.history.len(), 1);
    assert_eq!(created_iqd.history[0].operation_type, "created");

    let created_usd = receipts::create(
        &mut connection,
        receipt_input(&first_customer.id, "10", "USD"),
    )
    .unwrap()
    .receipt
    .unwrap();
    assert_eq!(created_usd.amount, 10.0);
    assert_eq!(balances(&connection, &first_customer.id), (-2_500, 4_000));

    receipts::update(
        &mut connection,
        &created_iqd.id,
        receipt_input(&first_customer.id, "150", "IQD"),
    )
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (-5_000, 4_000));

    receipts::update(
        &mut connection,
        &created_iqd.id,
        receipt_input(&first_customer.id, "150", "USD"),
    )
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (10_000, -11_000));

    let changed_customer = receipts::update(
        &mut connection,
        &created_iqd.id,
        receipt_input(&second_customer.id, "150", "USD"),
    )
    .unwrap()
    .receipt
    .unwrap();
    assert_eq!(balances(&connection, &first_customer.id), (10_000, 4_000));
    assert_eq!(balances(&connection, &second_customer.id), (0, -15_000));
    assert_eq!(
        changed_customer.customer_name_snapshot,
        "زبون الواصل الثاني"
    );

    let mut renamed = customer_input();
    renamed.name = "اسم زبون واصل جديد".into();
    renamed.usd_balance = -150.0;
    customers::save(&connection, Some(&second_customer.id), renamed).unwrap();
    let mut unrelated = receipt_input(&second_customer.id, "150", "USD");
    unrelated.business_date = "2026-10-06".into();
    unrelated.notes = "ملاحظة معدلة".into();
    let stable_snapshot = receipts::update(&mut connection, &created_iqd.id, unrelated)
        .unwrap()
        .receipt
        .unwrap();
    assert_eq!(stable_snapshot.customer_name_snapshot, "زبون الواصل الثاني");
    assert_eq!(stable_snapshot.notes, "ملاحظة معدلة");
    assert_eq!(
        receipts::list(&connection, Some("2026-10-06"))
            .unwrap()
            .len(),
        1
    );

    let deleted = receipts::soft_delete(&mut connection, &created_iqd.id, "اختبار الحذف")
        .unwrap()
        .receipt
        .unwrap();
    assert!(deleted.is_deleted);
    assert_eq!(deleted.deletion_reason.as_deref(), Some("اختبار الحذف"));
    assert_eq!(balances(&connection, &second_customer.id), (0, 0));
    assert_eq!(balances(&connection, &first_customer.id), (10_000, 4_000));
    assert_eq!(deleted.history.last().unwrap().operation_type, "deleted");

    let mut archived_input = customer_input();
    archived_input.name = "زبون مؤرشف".into();
    archived_input.iqd_balance = 100.0;
    let archived_customer = customers::save(&connection, None, archived_input).unwrap();
    let archived_receipt = receipts::create(
        &mut connection,
        receipt_input(&archived_customer.id, "100", "IQD"),
    )
    .unwrap()
    .receipt
    .unwrap();
    customers::set_archived(&connection, &archived_customer.id, true).unwrap();
    let mut archived_edit = receipt_input(&archived_customer.id, "100", "IQD");
    archived_edit.notes = "تعديل مرجع مؤرشف".into();
    let archived_updated = receipts::update(&mut connection, &archived_receipt.id, archived_edit)
        .unwrap()
        .receipt
        .unwrap();
    assert_eq!(archived_updated.customer_name_snapshot, "زبون مؤرشف");
    assert_eq!(balances(&connection, &archived_customer.id), (0, 0));

    let audit_count: i64 = connection
        .query_row(
            "SELECT count(*) FROM operation_history WHERE receipt_id IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(audit_count >= 8);
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let foreign_key_violations: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(foreign_key_violations, 0);
    drop(connection);

    let connection = initialize(&directory.0).unwrap();
    assert_eq!(receipts::list(&connection, None).unwrap().len(), 3);
    assert!(
        receipts::get(&connection, &created_iqd.id)
            .unwrap()
            .unwrap()
            .is_deleted
    );
    assert_eq!(balances(&connection, &first_customer.id), (10_000, 4_000));
    assert_eq!(balances(&connection, &second_customer.id), (0, 0));
}

#[test]
fn receipt_failures_roll_back_record_balance_and_history() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    let customer = customers::save(&connection, None, customer_input()).unwrap();
    assert!(receipts::create(&mut connection, receipt_input("missing", "10", "IQD")).is_err());
    assert!(receipts::create(&mut connection, receipt_input(&customer.id, "0", "IQD")).is_err());
    assert!(receipts::create(&mut connection, receipt_input(&customer.id, "10", "EUR")).is_err());

    connection.execute_batch("CREATE TRIGGER fail_receipt_history BEFORE INSERT ON operation_history WHEN NEW.receipt_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'test rollback'); END;").unwrap();
    assert!(receipts::create(&mut connection, receipt_input(&customer.id, "25", "IQD")).is_err());
    assert!(receipts::list(&connection, None).unwrap().is_empty());
    assert_eq!(balances(&connection, &customer.id), (0, 0));
    connection
        .execute_batch("DROP TRIGGER fail_receipt_history;")
        .unwrap();

    let created = receipts::create(&mut connection, receipt_input(&customer.id, "25", "IQD"))
        .unwrap()
        .receipt
        .unwrap();
    connection.execute_batch("CREATE TRIGGER fail_receipt_update_history BEFORE INSERT ON operation_history WHEN NEW.operation_type = 'updated' BEGIN SELECT RAISE(ABORT, 'test update rollback'); END;").unwrap();
    assert!(
        receipts::update(
            &mut connection,
            &created.id,
            receipt_input(&customer.id, "40", "IQD")
        )
        .is_err()
    );
    let unchanged = receipts::get(&connection, &created.id).unwrap().unwrap();
    assert_eq!(unchanged.amount, 25.0);
    assert_eq!(unchanged.history.len(), 1);
    assert_eq!(balances(&connection, &customer.id), (-2_500, 0));
}

#[test]
fn local_auth_lifecycle_and_restart() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    assert!(!auth::status(&connection).unwrap().has_account);
    assert!(auth::create_first(&mut connection, create_account_input(" ", "password1")).is_err());
    assert!(auth::create_first(&mut connection, create_account_input("admin", "short")).is_err());

    let session = auth::create_first(
        &mut connection,
        create_account_input("  مدير النظام  ", "first-pass-1"),
    )
    .unwrap();
    assert_eq!(session.username, "مدير النظام");
    assert!(auth::status(&connection).unwrap().has_account);
    assert!(
        auth::create_first(
            &mut connection,
            create_account_input("other", "second-pass-2")
        )
        .is_err()
    );

    let stored_hash: String = connection
        .query_row(
            "SELECT password_hash FROM local_user WHERE id=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_ne!(stored_hash, "first-pass-1");
    assert!(stored_hash.starts_with("$argon2"));
    let status_json = serde_json::to_string(&auth::status(&connection).unwrap()).unwrap();
    let session_json = serde_json::to_string(&session).unwrap();
    assert_eq!(status_json, r#"{"hasAccount":true}"#);
    assert_eq!(session_json, r#"{"username":"مدير النظام"}"#);
    assert!(!status_json.contains("password"));
    assert!(!session_json.contains("password"));

    assert_eq!(
        auth::login(&connection, login_input("مدير النظام", "first-pass-1"))
            .unwrap()
            .username,
        "مدير النظام"
    );
    assert!(auth::login(&connection, login_input("مدير النظام", "wrong-pass")).is_err());
    assert!(auth::login(&connection, login_input("wrong-user", "first-pass-1")).is_err());

    assert!(
        auth::change_password(
            &mut connection,
            auth::ChangePasswordInput {
                current_password: "wrong-pass".into(),
                new_password: "second-pass-2".into(),
            }
        )
        .is_err()
    );
    assert!(auth::login(&connection, login_input("مدير النظام", "first-pass-1")).is_ok());
    auth::change_password(
        &mut connection,
        auth::ChangePasswordInput {
            current_password: "first-pass-1".into(),
            new_password: "second-pass-2".into(),
        },
    )
    .unwrap();
    assert!(auth::login(&connection, login_input("مدير النظام", "first-pass-1")).is_err());
    assert!(auth::login(&connection, login_input("مدير النظام", "second-pass-2")).is_ok());
    drop(connection);

    let connection = initialize(&directory.0).unwrap();
    assert!(auth::status(&connection).unwrap().has_account);
    assert!(auth::login(&connection, login_input("مدير النظام", "second-pass-2")).is_ok());
}

#[test]
fn schema_three_migrates_to_transfers_without_losing_data() {
    let directory = TestDirectory::new();
    let mut connection = initialize(&directory.0).unwrap();
    connection
        .execute(
            "INSERT INTO app_metadata(key, value) VALUES ('retained_setting', 'yes')",
            [],
        )
        .unwrap();
    auth::create_first(&mut connection, create_account_input("admin", "password-1")).unwrap();
    let customer = customers::save(&connection, None, customer_input()).unwrap();
    let product = products::save(&connection, None, product_input("منتج الترحيل")).unwrap();
    sales::create(
        &mut connection,
        sale_input(&customer.id, &product.id, "1", "10", "IQD"),
    )
    .unwrap();
    receipts::create(&mut connection, receipt_input(&customer.id, "2", "IQD")).unwrap();
    connection.execute_batch("CREATE TABLE operation_history_v3 (
            id TEXT PRIMARY KEY NOT NULL, sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
            receipt_id TEXT REFERENCES receipts(id) ON DELETE RESTRICT,
            operation_type TEXT NOT NULL CHECK (operation_type IN ('created', 'updated', 'deleted')),
            actor TEXT NOT NULL CHECK (length(trim(actor)) > 0), changed_at TEXT NOT NULL,
            changes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes_json) AND json_type(changes_json) = 'array'),
            CHECK ((sale_id IS NOT NULL) + (receipt_id IS NOT NULL) = 1)) STRICT;
        INSERT INTO operation_history_v3 SELECT id, sale_id, receipt_id, operation_type, actor, changed_at, changes_json FROM operation_history WHERE transfer_id IS NULL;
        DROP TABLE operation_history; ALTER TABLE operation_history_v3 RENAME TO operation_history;
        DROP TABLE transfers;
        UPDATE app_metadata SET value='3' WHERE key='schema_version'; PRAGMA user_version=3;").unwrap();
    drop(connection);

    let connection = initialize(&directory.0).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    let metadata_version: String = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key='schema_version'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let retained: String = connection
        .query_row(
            "SELECT value FROM app_metadata WHERE key='retained_setting'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 4);
    assert_eq!(metadata_version, "4");
    assert_eq!(retained, "yes");
    assert!(transfers::list(&connection, None).unwrap().is_empty());
    assert_eq!(customers::list(&connection, None).unwrap().len(), 1);
    assert_eq!(products::list(&connection, None).unwrap().len(), 1);
    assert_eq!(sales::list(&connection, None).unwrap().len(), 1);
    assert_eq!(receipts::list(&connection, None).unwrap().len(), 1);
    assert_eq!(
        connection
            .query_row("SELECT count(*) FROM operation_history", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert!(auth::login(&connection, login_input("admin", "password-1")).is_ok());
}
