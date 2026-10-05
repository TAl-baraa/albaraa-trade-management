CREATE TABLE app_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE customers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    iqd_balance_minor INTEGER NOT NULL DEFAULT 0,
    usd_balance_minor INTEGER NOT NULL DEFAULT 0,
    last_purchase_date TEXT,
    last_payment_date TEXT,
    has_transaction_history INTEGER NOT NULL DEFAULT 0 CHECK (has_transaction_history IN (0, 1)),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    CHECK ((is_archived = 0 AND archived_at IS NULL) OR (is_archived = 1 AND archived_at IS NOT NULL))
) STRICT;

CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    normalized_name TEXT NOT NULL UNIQUE CHECK (length(trim(normalized_name)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sales (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name_snapshot TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    weight_tons TEXT NOT NULL CHECK (weight_tons NOT GLOB '*[^0-9.]*' AND weight_tons GLOB '[0-9]*' AND length(weight_tons) - length(replace(weight_tons, '.', '')) <= 1 AND weight_tons NOT LIKE '%.' AND weight_tons GLOB '*[1-9]*'),
    driver_name TEXT NOT NULL CHECK (length(trim(driver_name)) > 0),
    unit_sale_price TEXT NOT NULL CHECK (unit_sale_price NOT GLOB '*[^0-9.]*' AND unit_sale_price GLOB '[0-9]*' AND length(unit_sale_price) - length(replace(unit_sale_price, '.', '')) <= 1 AND unit_sale_price NOT LIKE '%.' AND unit_sale_price GLOB '*[1-9]*'),
    sale_currency TEXT NOT NULL CHECK (sale_currency IN ('IQD', 'USD')),
    total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor > 0),
    sale_date TEXT NOT NULL CHECK (length(sale_date) = 10 AND sale_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(sale_date, '+0 days') IS sale_date),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (is_reviewed IN (0, 1)),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    deleted_by TEXT,
    deletion_reason TEXT,
    CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL) OR
        (is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND deletion_reason IS NOT NULL AND length(trim(deletion_reason)) > 0))
) STRICT;

CREATE TABLE receipts (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name_snapshot TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL CHECK (currency IN ('IQD', 'USD')),
    business_date TEXT NOT NULL CHECK (length(business_date) = 10 AND business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(business_date, '+0 days') IS business_date),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    deleted_by TEXT,
    deletion_reason TEXT,
    CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL) OR
        (is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND deletion_reason IS NOT NULL AND length(trim(deletion_reason)) > 0))
) STRICT;

CREATE TABLE operation_history (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
    receipt_id TEXT REFERENCES receipts(id) ON DELETE RESTRICT,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('created', 'updated', 'deleted')),
    actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
    changed_at TEXT NOT NULL,
    changes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes_json) AND json_type(changes_json) = 'array'),
    CHECK ((sale_id IS NOT NULL) + (receipt_id IS NOT NULL) = 1)
) STRICT;

CREATE INDEX customers_archive_name ON customers(is_archived, name);
CREATE INDEX products_archive_name ON products(is_archived, name);
CREATE INDEX sales_register ON sales(is_deleted, sale_date, created_at);
CREATE INDEX sales_customer ON sales(customer_id, is_deleted, sale_date);
CREATE INDEX sales_product ON sales(product_id);
CREATE INDEX receipts_register ON receipts(is_deleted, business_date, created_at);
CREATE INDEX receipts_customer ON receipts(customer_id, is_deleted, business_date);
CREATE INDEX history_sale ON operation_history(sale_id, changed_at);
CREATE INDEX history_receipt ON operation_history(receipt_id, changed_at);

INSERT INTO app_metadata(key, value) VALUES ('schema_version', '2');
PRAGMA user_version = 2;
