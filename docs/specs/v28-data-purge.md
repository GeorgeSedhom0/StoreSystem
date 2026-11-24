# v28 — Data purge (حذف السجلات القديمة)

Delete all **history** before a cutoff time, manually or on a weekly schedule.
The **setup** is kept, and so is every balance the app shows.

Reviewed against the code by three independent reviews (Fable, Opus, Sonnet).
Their correctness fixes and cuts are applied below.

## Decisions (owner)

- The cutoff can be any time up to *now*.
- Purging without a backup dump is an option chosen up front. A failed dump
  never falls back silently to purging without one.
- A purge may delete the open shift's bills. The shift report then counts from
  the cutoff.
- Schedule: every `weekday time` (e.g. Sunday 12:00), delete everything before
  that slot. If the app was off, it runs on the next start after a **2-minute
  cancel window**. The cutoff is the slot, not the run time.

## Kept vs deleted

**Always kept (setup):** products, packages, inventory/stock, batches, parties,
users, scopes, pages, stores, payment methods, employees, `db_meta`, and the
`id = -1` bill of each store.

**A bill unit** = the bill, its edit twin `-<id>`, and its transfer partner
(plus the partner's twin). A unit is deleted or kept as a whole. Its age is the
**positive bills' `time`** (the twin's time is the edit time).

A unit is deleted when all of these hold:

- every positive bill in it has `time < cutoff`,
- every `cash_flow` and `installments_flow` row it owns has `time < cutoff`
  (a pre-cutoff installment paid after the cutoff is kept),
- it is not **protected**: a `BNPL` bill (the type flips to `sell` when
  collected, so BNPL = still owed), an installment bill not fully paid
  (`paid + Σflow < |Σ price·amount| − 0.01`, the same rule as
  `installment.py`), or a reserve bill that still has `reserved_products`.

Deleting a unit also removes its `products_flow`, `cash_flow` (and their
ledger rows), `bills_collections` rows, `bills_pairs`, `reserved_products`,
`installments(+_flow)` and `bill_corrections` (self-references are nulled
first).

**Also deleted when `< cutoff`:**

- bill-less `cash_flow` rows: manual in/out, deposits, salary rows, settle and
  forward rows. (Settle/forward rows exist only for sell/return/transfer bills,
  which are never protected, so they always go with their bill.)
- account-to-account transfers (`account_transactions` with no cash row),
- `products_flow` on bill `-1` (manual stock edits),
- `salaries`, except **each employee's latest one** (`MAX(period_end)` drives
  the next pay period and the double-pay guard),
- `employee_attendance` on or before that latest `period_end`,
- shifts that ended before the cutoff (a shift spanning the cutoff gets
  `start_date_time = cutoff`),
- `notifications`,
- closed restock requests (`closed_at < cutoff`).

Rows with `NULL` time never match, so they are kept.

## Carry-forward (balances stay the same)

All opening rows get the fixed time **`1970-01-01 00:00:00`**. That sorts
before every real row, sits outside every date-windowed report, and stays inside
every un-windowed `SUM` (balances, ledgers, party cash).

**Cash.** The deleted `cash_flow` rows, grouped by
`(store, party_id, bill_id IS NULL)`, become one opening `cash_flow` row per
group with `description = 'رصيد مرحّل'`:

- Bill-less groups stay `bill_id NULL`, which keeps `/store-balances` exact.
- Bill-linked groups go on `bill_id = -1`.

**Accounts.** The mirror trigger's ledger rows for those opening rows are
removed. Instead, write one `account_transactions` row per
`(store, payment_method)` = Σ of the deleted ledger rows (cash-linked and
transfers), `source = 'opening'`, `cash_flow_id NULL`. Cash per
store/party/kind and balance per account are each preserved exactly, without
assuming they were consistent with each other.

**Running totals.** The delete/insert total triggers are skipped (flag below),
so rows after the last deleted row `L` of each store are untouched. The new
order (opening rows, then the kept rows that sorted before `L`) is re-chained so
that it ends exactly at `L.total`: the opening chain starts at
`L.total − Σ(kept amounts before L)`. The drawer total therefore never changes,
even when old totals have drifted, and drift after `L` stays as it was.

**FIFO.** Per `(store, product)`, replay the deleted rows the way
`profit_fifo` does: `bill_id >= -1`, ordered by `COALESCE(bill.time, row.time),
id`. Write the resulting cost layers, and a negative row for any deficit, as
`products_flow` rows on bill `-1` at the opening time. The stock trigger is
skipped for them, because `product_inventory` is already right. (The flow
`total` trigger still computes their running total; that is fine because they
come first.)

**Restarts after a purge (documented, not compensated):** a party's lifetime
"total consumed" and bill count, the customer loyalty category (counts earlier
bills), analytics for periods before the cutoff, product price history (the
inventory-value chart before the first buy after the cutoff), restock's 30-day
sales rate, and "long-missed parties".

## Triggers (v28 migration)

`SET LOCAL openstore.purge = 'on'` (set only by the purge, gone at commit)
makes three functions return at once:

- `bubble_fix_total_after_delete`
- `update_total_after_insert`
- `update_stock_after_insert`

With the flag off, behaviour is the same as today.

## Checks before commit (rollback on any difference > 0.01)

1. `Σ cash_flow.amount` per `(store, party, bill_id IS NULL)`
2. `Σ account_transactions.amount` per `(store, method)`
3. the latest `cash_flow.total` per store
4. `Σ products_flow.amount` and `product_inventory.stock` per `(store, product)`
5. FIFO profit per store for `[cutoff, now]`
6. `Σ cash_flow.amount` per store with `time >= cutoff` (nothing moved across
   the cutoff)

A failure names what differed. The preview shows the same checks.

## Running a purge (`server/purge.py`)

`run_purge(cutoff, apply, with_backup, source)`; preview runs the same code and
rolls back.

1. Refuse if `cutoff > local_now()`, or if a purge is already running (thread
   lock plus `pg_try_advisory_xact_lock`).
2. If applying `with_backup`: `dump_database()` to
   `openstore-<db>-<ts>-purge.sql.gz`. The file is **not** added to the backup
   manifest, so retention never deletes it. If the dump fails, stop.
3. One transaction: `_lock_stores(all)`, then `statement_timeout = 0`, the
   flag, a temp table of the units to delete, the deletes, the opening rows,
   the total shifts, the checks, then commit (or roll back for a preview).
4. A `data_purges` row records the result. Telegram gets a text notice, and
   the dump file when it was taken and is small enough.
5. On startup, mark stale `running` rows as `failed`.

## Restore (import back)

A purge archive is an ordinary dump for the existing restore. Today's restore
drops everything first and ignores errors, so a bad file leaves an empty
database. Minimum fix:

1. take a `pre-restore` dump,
2. run one `psql --single-transaction -v ON_ERROR_STOP=1`: drop and recreate
   the `public` schema, then load the file,
3. check the exit code.

Any failure leaves the current data untouched.

## Schedule

`db_meta.purge_settings`: `enabled` (default off), `weekday` (0 = Monday …
6 = Sunday, default 6), `time` (default 12:00), `with_backup` (default on).
`db_meta.purge_status` holds the last slot handled and its result.

- The loop runs in the backend (like backups): 90 s after start, then every
  30 s.
- **Due** = the latest slot `<= now` that is newer than the last handled slot.
  Missed slots collapse into one run.
- On enable, the latest past slot is marked handled, so enabling never runs a
  past slot.
- When due, the run is **pending for 2 minutes**: a banner on every client
  (polling `/purge/status`) with Cancel, plus a Telegram text. Cancel marks the
  slot handled (`cancelled`).
- **Clock guard:** if the slot is more than 30 days after the store was last
  seen active (newest `cash_flow` time, or the last purge's cutoff), it does not
  auto-run. Status shows "needs approval", with a
  button that runs it.
- Failure (dump or check): status `failed` plus Telegram, and the slot is marked
  handled. The next slot covers the same history anyway.

## API

| | |
|---|---|
| `POST /purge/preview {cutoff}` | counts, kept-because-open counts, checks |
| `POST /purge/apply {cutoff, with_backup, confirm}` | runs it; `confirm` must be `حذف` (or `حذف بدون نسخة`) |
| `GET /purge/status` | settings, pending run, last result, next slot, history |
| `PUT /purge/settings` | |
| `POST /purge/cancel` · `POST /purge/approve` | pending / needs-approval slot |

Access: page `/data-purge`, granted to `admin`, checked server-side (as with
bill corrections). The status endpoint, which the banner uses, only needs
login.

## Schema (v28)

The `data_purges` table, the three trigger functions, the `pages` row, and its
admin grant. All of it goes in `update_db_28.py` and `init.py`, plus
`LATEST_DB_VERSION = 28`.

## UI

Page `/data-purge` «حذف السجلات» (a sidebar entry for scopes that have the
page, like bill corrections), in three sections:

- manual: cutoff → preview (counts, what is kept because it's open, the six
  checks) → backup switch → typed confirm,
- weekly schedule,
- history with archive paths.

A global banner (in the layout, for every logged-in user) shows while a
scheduled run is pending (countdown + Cancel) or running. Backups list purge
archives with the kind «قبل حذف السجلات».

Restore stays in Settings → الأساسيات; it now takes a safety backup first and
loads in one transaction.

## Cut after review

Monthly chunks, the restore temp-DB swap, phase-2 selective re-import, the
grace period, the heartbeat, the Telegram cancel button, the notification row,
and the "newest backup still holding it" hint.

## Tests run

Done against a throwaway Postgres 17 cluster, with the history seeded through
the real API: buys, transfers (with and without settle-from-debt), sales on
mixed and off-store accounts, returns, negative stock, open and completed BNPL,
installments (paid, open, and paid after the cutoff), a live reservation, an
edited bill, a bill correction, manual cash, an account transfer, an
inter-store transfer, salaries and attendance, and shifts. The scenarios:

- preview rolls back,
- a purge at the cutoff,
- a second purge folds the opening rows,
- a forced check failure rolls back,
- a purge up to now,
- restoring an archive, and refusing a broken file with the data untouched,
- scheduler: missed slots collapse, cancel, needs-approval, and a settings
  change,
- drifted totals, including a purge up to now.

After every scenario the accounts, store balances, drawer, stock, party cash,
FIFO income and detailed analytics after the cutoff match exactly. The only
exceptions are the documented statistics above.

The migration from a v27 database gives a schema and seed rows identical to a
fresh `init.py`, including when the migration runs twice.

Timing: 150k bills and 468k stock rows take about 30 s for the first big purge
and about 3.5 s for a weekly one.
