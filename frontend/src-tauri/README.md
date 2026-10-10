# Windows desktop wrapper

Run commands from `frontend/`:

```bash
npm install
npm run tauri -- dev
```

Tauri starts the existing Vite server at `http://localhost:5173`. Stop any
separately running Vite server on that port before starting Tauri. Browser-only
development remains available with `npm run dev`.

The Windows build requires Rust with the MSVC toolchain, Visual Studio C++ Build
Tools, Windows SDK, and WebView2. The first launch downloads and compiles Rust
dependencies.

`npm run tauri -- build` runs `npm run build`, embeds `../dist`, and builds an
NSIS installer. Windows executable and installer icons use the approved Al-Baraa
navy-and-gold symbol; the full approved logo remains in the repository as the
branding source.

Maintenance note: Windows may continue showing a previously cached Tauri icon
for an existing desktop shortcut after reinstalling version 1.0.0. The executable,
installer, application window and taskbar resources use the Al-Baraa icon. Review
desktop-shortcut cache handling in a future maintenance release.

The first production version is `1.0.0`. The Windows product name is
`Al-Baraa Trade Management`, and the stable application identifier is
`com.albaraa.trademanagement`. The installer contains application binaries and
static resources only; it never contains `albaraa.db`, backups, credentials, or
temporary statement PDFs.

Customers, products, sales, receipts and transfers use SQLite through typed Tauri commands exclusively.
Browser-only development displays an Arabic desktop-app requirement instead of
falling back to localStorage. Existing browser business data is disposable and is
not imported. Local single-user authentication and safe manual backup/restore are implemented.

## SQLite infrastructure (schema version 4)

`rusqlite` with its `bundled` feature compiles SQLite into the application; the
customer does not install a separate database service or SQLite runtime.

The database is `app.path().app_data_dir()/albaraa.db`. With this app identifier,
Windows resolves it to `%APPDATA%/com.albaraa.trademanagement/albaraa.db` (normally
`C:/Users/<user>/AppData/Roaming/com.albaraa.trademanagement/albaraa.db`). It is never
stored in the repository or bundled as a populated database.

The complete executable schema, including constraints and indexes, lives in
[`src/database/schema.sql`](src/database/schema.sql).

Version 2 removed the product purchase fields. Version 3 adds the singleton local
authentication table, and version 4 adds transfers. Existing version 2 and 3
databases migrate forward without changing existing business data. Version 1
contains disposable test data and is not migrated. The application rejects
unsupported versions rather than resetting data automatically.

| Table | Purpose and key fields |
| --- | --- |
| `app_metadata` | String key/value settings, `updated_at`; initial `schema_version = 4` only |
| `local_user` | Singleton ID, fixed username, Argon2id password hash, creation/update timestamps |
| `customers` | ID, name, phone, notes, separate signed IQD/USD balances, last purchase/payment business dates, history flag, archive state/time, creation/update timestamps |
| `products` | ID, name, unique normalized name, notes, archive state, creation/update timestamps |
| `sales` | Customer/product foreign keys and name snapshots, decimal tons and unit price, driver, currency, total, sale business date, review state, timestamps and soft-deletion metadata |
| `receipts` | Customer foreign key/name snapshot, amount/currency, business date, notes, timestamps and soft-deletion metadata |
| `transfers` | Customer foreign key/name snapshot, amount/currency, business date, required description, optional notes, timestamps and soft-deletion metadata |
| `operation_history` | ID, exactly one sale/receipt/transfer foreign key, operation type, actor display name, timestamp, ordered JSON field changes |

All tables are STRICT. IDs remain text so existing UUID-style ID conventions can
be retained. Actor/deleted-by values are display names, not user accounts.
History `changes_json` retains the UI's ordered array of
`{field, previousValue, newValue}`; values can be strings, numbers, booleans or
null. SQLite checks that it is a valid JSON array; the future command layer must
validate each entry's shape. History entries should be appended in the same
transaction as the associated edit/deletion.

Balances and transaction amounts use signed 64-bit integer hundredths of their
own currency (`*_minor`): 125 means 1.25 IQD or USD according to the field/currency.
Positive customer balances mean the customer owes us; negative means we owe them.
No currency conversion or cross-currency total exists. Future frontend adapters
must check JavaScript safe-integer bounds before converting these values.
Sale weights and unit prices use validated plain decimal text to retain
arbitrary fractional precision; calculations must
use decimal arithmetic, not SQLite floating-point casts. Sale totals retain the
frontend's round-half-up to two decimals. Products have no price, currency or
exchange-rate fields; sale price and currency belong to each sale.

`normalized_name` must be generated with the existing trim/NFKC/Arabic-lowercase
normalization before product writes. Product names remain unique across archived
and active products. Transaction snapshots remain independent of later name or
price changes. Foreign keys restrict hard deletion of referenced records.
Business dates use `YYYY-MM-DD`; timestamps should use UTC ISO 8601 strings.
Customers retain their existing last-activity/history fields; future repository
writes must maintain them consistently. Customer statements can query sales and
receipts directly without duplicating a customer-account transaction table.

Initialization creates the application data directory and opens `albaraa.db`.
Every connection enables foreign keys, a five-second busy timeout and FULL
synchronous durability. SQLite's default rollback journal is used. Schema
creation and both version markers (`user_version` and `app_metadata`) are one
immediate transaction. Subsequent launches verify the version markers and query
all eight tables without reseeding or clearing data. Unknown versions, unversioned
nonempty databases, inconsistent metadata and SQL/I/O errors stop startup rather
than silently replacing data. Failed schema creation rolls back.

Before any supported migration changes an existing database, startup creates a
validated SQLite backup in `app_data_dir/recovery` named
`albaraa-before-migration-YYYY-MM-DD-HHMMSS.db`. The backup must pass
`integrity_check`, and its SQLite and metadata versions must match the source.
Startup aborts before opening the migration transaction if creation or validation
fails. Fresh database creation does not create a recovery backup.

Installing a newer NSIS package updates application files without replacing the
database under `%APPDATA%/com.albaraa.trademanagement`. Startup detects its schema
version and runs supported forward migrations. No installer or uninstall hook
deletes AppData, so uninstalling the application leaves the database for recovery
or a later reinstall; removing it is an explicit user/administrator action.

Only schema metadata is seeded. All five business/history tables start empty.
Customer mock data is not imported by the runtime, and obsolete product mocks were
removed. Existing customer/product/sales/receipt localStorage data is ignored and
never written. No business repository retains browser-storage persistence.

Validation from `frontend/src-tauri`:

```bash
cargo check
cargo test
```

The tests use disposable databases outside the repository and cover empty
initialization, reopening without data loss, integrity, foreign keys, currency,
money, business dates, history ownership, soft-deletion constraints and the
complete local-authentication lifecycle.

## Local authentication

The app has one local account with full access. On an empty database the React
shell shows first-run setup; otherwise it shows login. The username is fixed after
setup. The authenticated session exists only in React memory, so closing or
reloading the application requires login again. Logout clears that session without
closing the process.

Rust performs setup, login verification and password changes. Passwords must be
at least eight characters and are hashed with Argon2id using a fresh random salt
generated by the standard `argon2`/`rand_core` libraries. SQLite stores only the
encoded hash. Command responses contain only `hasAccount` or `username`; hashes
and passwords are never serialized, logged or written to audit history.

- `auth_status`: reports whether the singleton account exists.
- `create_first_user`: creates the account only when the table is empty.
- `verify_login`: returns the same Arabic error for a wrong username or password.
- `change_password`: verifies the current password and atomically replaces its hash.

## Customer/product commands

`commands.rs` is the narrow IPC boundary; `database/customers.rs` and
`database/products.rs` implement the operations against the existing schema.
The app stores only its resolved data-directory path in managed state. Commands
open configured SQLite connections; SQL and caller-selected file paths are not
exposed to the webview.

- `list_customers`, `list_products`: optional `archived` filter (null/all,
  false/active, true/archived).
- `get_customer`, `get_product`: ID lookup, null if absent.
- `create_customer`, `update_customer`: editable profile/balance fields only.
- `create_product`, `update_product`: editable product fields only.
- `archive_customer`, `reactivate_customer`, `delete_customer`.
- `archive_product`, `reactivate_product`.
- `list_sales`, `list_sales_by_business_date`, `get_sale`.
- `create_sale`, `update_sale`, `soft_delete_sale`, `toggle_sale_reviewed`.
- `list_receipts`, `list_receipts_by_business_date`, `get_receipt`.
- `create_receipt`, `update_receipt`, `soft_delete_receipt`.
- `list_transfers`, `list_transfers_by_business_date`, `get_transfer`.
- `create_transfer`, `update_transfer`, `soft_delete_transfer`.

Rust creates IDs and UTC timestamps. Updates preserve creation timestamps,
archive state and historical customer fields. Customer balances use the existing
schema's hundredths representation (rounded like the existing JavaScript
accounting operations), with finite/safe-integer validation. Product command
inputs contain only `name` and `notes`.

Customer archiving requires both balances to be zero. Permanent deletion also
requires no history flag and no SQLite sales/receipts/transfers, including soft-deleted
records. Reactivation preserves all balances/history. Product archiving has no
additional restrictions. Rust derives normalized names using trim, Unicode NFKC
and lowercase; SQLite's unique constraint applies to active and archived names.
Products do not have currency or rate validation. Sales/receipts retain their
existing currency rules and SQLite currency CHECK constraints.

New dependencies are the official `@tauri-apps/api` for supported IPC, direct
`serde` and `serde_json` support for command and audit DTOs, and
`unicode-normalization` so the backend can enforce NFKC uniqueness independently
of the browser. Authentication adds `argon2` and OS-backed `rand_core` randomness
for standard salted password hashing.

The backup interface uses the official Tauri dialog plugin for native folder and
file selection, and the opener plugin to open the configured directory in the
platform file explorer. Neither plugin grants the application cloud-account access.

## Manual backup and restore

The user chooses any writable local directory. Its canonical path is stored as
`backup_directory` in `app_metadata`; `last_successful_backup_at` is updated only
after a new backup passes validation. The directory may be changed at any time.
Google Drive for Desktop, OneDrive, removable drives and ordinary folders are
treated identically as filesystem locations. The application has no Google API,
cloud login or synchronization logic.

Manual backups use SQLite's online backup API while the live database is open.
Files are named `albaraa-backup-YYYY-MM-DD-HHMMSS.db`; a numeric suffix prevents
overwriting when multiple backups are created in the same second. Before success
is reported, the result is reopened read-only, checked with `PRAGMA integrity_check`,
and verified for schema version 4, matching metadata and all expected tables.

Restore accepts a `.db` file from any accessible location. Validation happens
before the live database is touched. The app then creates and validates a safety
snapshot in `<app-data>/recovery` named
`albaraa-before-restore-YYYY-MM-DD-HHMMSS.db`. If that snapshot cannot be created,
restore aborts. SQLite's online backup API replaces the live contents, the database
is reopened and verified, and the React session is cleared so the restored local
credentials become authoritative. Source and safety files are retained.

## Automatic backups

A Rust scheduler starts with the application, performs one immediate due check,
then checks every 10 minutes while the process is running. Timing is based on
`last_successful_auto_backup_at`: no previous automatic backup is immediately due,
and subsequent backups become due after three hours. The scheduler does not run
while the application is closed.

Automatic files use `albaraa-auto-backup-YYYY-MM-DD-HHMMSS.db` and the same SQLite
online-backup and validation path as manual backups. After a validated automatic
backup, both `last_successful_auto_backup_at` and `last_successful_backup_at` are
updated. Only filenames matching the exact automatic naming convention participate
in retention. The newest 20 are kept; manual, recovery and unrelated files are
never removed.

Manual backup, automatic backup and restore share one process-wide mutex. An
automatic check skips silently while another operation holds the mutex. A manual
backup or restore requested during another backup operation returns a clear Arabic
busy message. Automatic failures are stored as `last_auto_backup_error` and shown
non-intrusively on the backup page without blocking application use.

## Customer statement PDF sharing

The customer account dialog keeps its existing browser print action. Its Windows
share action prints the same approved print-only DOM and CSS to a real A4 portrait
PDF through WebView2 `PrintToPdf`, then attaches only that PDF to the native Windows
Share Sheet through `IDataTransferManagerInterop`. The application does not use a
WhatsApp API, select a recipient, upload the statement, or expose the SQLite file.

Statement files are named `مكتب البراء - <customer> - كشف حساب <currency>.pdf` after
removing Windows-invalid filename characters while preserving Unicode. They are written
below the Tauri application cache directory in `statement-pdfs`; only matching statement
PDFs older than 24 hours are removed.
If the Windows Share Sheet cannot open, the generated PDF is opened with the system
PDF application so the user can save or share it manually. WhatsApp appears only
when Windows exposes it as an installed share target.

## Atomic Sales, Receipts and Transfers

Sales creation, updates and soft deletion are native SQLite transactions. Rust
validates references, currency, positive decimal inputs, dates and the calculated
total. It writes the sale, customer balance and audit history together. Updates
reverse the original effect before applying the replacement. Unrelated edits
preserve stored customer and product name snapshots.

Receipt creation, updates and soft deletion follow the same transaction boundary.
Receipt creation subtracts the amount and permits negative customer balances as
credit. Updates reverse the original effect before applying the replacement, and
deletion restores the original amount. Customer deletion relies on SQLite foreign
keys and history checks. The legacy accounting bridge and browser-storage
repositories have been removed. No old test data is migrated.

Transfers use their own table and register. Creation increases the selected
customer balance, updates reverse the original effect before applying the new
effect, and soft deletion reverses the amount. Each mutation stores audit history
in the same transaction. IQD and USD remain separate. Schema version 4 migrates
version 3 databases in place, preserving existing business, authentication and
backup metadata. Customer statements treat transfers as debit transactions and
show their required description without inventing product, driver or price data.
