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

The existing localStorage implementation is unchanged. WebView2 uses a separate
application profile from Chrome/Edge, so browser records do not automatically
appear in the desktop app. Development and packaged app origins also differ;
their localStorage should not be assumed to be shared. No migration is included.

SQLite is initialized by Rust during Tauri startup. No frontend database commands,
authentication, backups, or localStorage import are implemented yet.

## SQLite infrastructure (schema version 1)

`rusqlite` with its `bundled` feature compiles SQLite into the application; the
customer does not install a separate database service or SQLite runtime.

The database is `app.path().app_data_dir()/albaraa.db`. With this app identifier,
Windows resolves it to `%APPDATA%/com.albaraa.trademanagement/albaraa.db` (normally
`C:/Users/<user>/AppData/Roaming/com.albaraa.trademanagement/albaraa.db`). It is never
stored in the repository or bundled as a populated database.

The complete executable schema, including constraints and indexes, lives in
[`src/database/schema.sql`](src/database/schema.sql).

| Table | Purpose and key fields |
| --- | --- |
| `app_metadata` | String key/value settings, `updated_at`; initial `schema_version = 1` only |
| `customers` | ID, name, phone, notes, separate signed IQD/USD balances, last purchase/payment business dates, history flag, archive state/time, creation/update timestamps |
| `products` | ID, name, unique normalized name, purchase currency/price and optional exchange-rate reference, notes, archive state, creation/update timestamps |
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
Weights, unit prices, product purchase prices and exchange rates use validated
plain decimal text to retain arbitrary fractional precision; calculations must
use decimal arithmetic, not SQLite floating-point casts. Sale totals retain the
frontend's round-half-up to two decimals. Exchange rate is existing product
reference data only; it never modifies customer balances.

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
The unchanged frontend still temporarily reads/writes localStorage and may show
its existing mock data; none of that data enters SQLite. Removing mock seeding
and replacing those repositories is required before customer delivery.

Validation from `frontend/src-tauri`:

```bash
cargo check
cargo test
```

The tests use disposable databases outside the repository and cover empty
initialization, reopening without data loss, integrity, foreign keys, currency,
money, business dates, history ownership and soft-deletion constraints.
