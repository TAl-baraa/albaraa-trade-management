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
NSIS installer. The included icons are the default Tauri placeholder icons.

Customers and products now use SQLite through typed Tauri commands exclusively.
Browser-only development displays an Arabic desktop-app requirement instead of
falling back to localStorage. Sales and receipts still use their existing
localStorage repositories. WebView2, browser development and packaged origins
have separate storage profiles; none of their old customer/product test data is
imported. Authentication and backups are not implemented.

## SQLite infrastructure (schema version 2)

`rusqlite` with its `bundled` feature compiles SQLite into the application; the
customer does not install a separate database service or SQLite runtime.

The database is `app.path().app_data_dir()/albaraa.db`. With this app identifier,
Windows resolves it to `%APPDATA%/com.albaraa.trademanagement/albaraa.db` (normally
`C:/Users/<user>/AppData/Roaming/com.albaraa.trademanagement/albaraa.db`). It is never
stored in the repository or bundled as a populated database.

The complete executable schema, including constraints and indexes, lives in
[`src/database/schema.sql`](src/database/schema.sql).

Version 2 removes the product purchase fields. Version 1 contains disposable test
data and is not migrated: close the app and remove only its `albaraa.db` file
(and any associated SQLite journal files) to initialize an empty version 2
database. The application rejects unsupported versions rather than resetting
data automatically. No customer, sale or receipt schema fields changed.

| Table | Purpose and key fields |
| --- | --- |
| `app_metadata` | String key/value settings, `updated_at`; initial `schema_version = 2` only |
| `customers` | ID, name, phone, notes, separate signed IQD/USD balances, last purchase/payment business dates, history flag, archive state/time, creation/update timestamps |
| `products` | ID, name, unique normalized name, notes, archive state, creation/update timestamps |
| `sales` | Customer/product foreign keys and name snapshots, decimal tons and unit price, driver, currency, total, sale business date, review state, timestamps and soft-deletion metadata |
| `receipts` | Customer foreign key/name snapshot, amount/currency, business date, notes, timestamps and soft-deletion metadata |
| `operation_history` | ID, exactly one sale/receipt foreign key, operation type, actor display name, timestamp, ordered JSON field changes |

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
all six tables without reseeding or clearing data. Unknown versions, unversioned
nonempty databases, inconsistent metadata and SQL/I/O errors stop startup rather
than silently replacing data. Failed schema creation rolls back.

Only schema metadata is seeded. All five business/history tables start empty.
Customer mock data is not imported by the runtime, and obsolete product mocks were
removed. Existing customer/product localStorage keys are ignored and never written. Sales and
receipts still temporarily read/write localStorage; old test transactions can
therefore reference missing customers/products. Their snapshots still display,
but they are not imported or matched to newly created SQLite records.

Validation from `frontend/src-tauri`:

```bash
cargo check
cargo test
```

The tests use disposable databases outside the repository and cover empty
initialization, reopening without data loss, integrity, foreign keys, currency,
money, business dates, history ownership and soft-deletion constraints.

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
- `update_customer_balances`: temporary legacy-accounting bridge described below.

Rust creates IDs and UTC timestamps. Updates preserve creation timestamps,
archive state and historical customer fields. Customer balances use the existing
schema's hundredths representation (rounded like the existing JavaScript
accounting operations), with finite/safe-integer validation. Product command
inputs contain only `name` and `notes`.

Customer archiving requires both balances to be zero. Permanent deletion also
requires no history flag and no SQLite sales/receipts, including soft-deleted
records. Reactivation preserves all balances/history. Product archiving has no
additional restrictions. Rust derives normalized names using trim, Unicode NFKC
and lowercase; SQLite's unique constraint applies to active and archived names.
Products do not have currency or rate validation. Sales/receipts retain their
existing currency rules and SQLite currency CHECK constraints.

New dependencies are the official `@tauri-apps/api` for supported IPC, direct
`serde` derive support for command DTOs (already present transitively), and
`unicode-normalization` so the backend can enforce NFKC uniqueness independently
of the browser. The sales-only product cleanup adds no further dependencies.

## Temporary Sales/Receipts compatibility

Accounting formulas, transaction repositories and transaction storage formats
are unchanged. Their callers now await SQLite customer/product lookups. Legacy
operations are serialized within the current webview, and their existing
calculated balances are persisted through `update_customer_balances`.
That command only updates balances and the sticky history flag; it does not
replace customer profiles, delete records or write transactions to SQLite.
All balance updates for one operation are one SQLite transaction, with expected
previous balances checked to reject stale updates. If that command fails, the
service attempts to restore its previous localStorage transaction list.

This is **not an atomic transaction across the two stores**: a crash between the
localStorage write and SQLite write can leave them inconsistent. Serialization
does not coordinate multiple app processes. Rust cannot inspect WebView
localStorage references, so customer deletion also checks legacy sales/receipts
in TypeScript. Newly performed legacy operations set the SQLite history flag;
the server cannot independently verify old browser history. Do not treat this
intermediate phase as production-ready accounting or switch origins with test
balances that depend on legacy transactions. No old test data is migrated.

The next step is to move sales/receipts and their balance/history writes into
single native SQLite transactions and remove this temporary bridge.
