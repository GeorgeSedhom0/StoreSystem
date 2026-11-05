# v26 — Product packages, attendance & salary, bill payment edits, phone UX

Status: implemented in this change set. DB version **26** (`server/update_db_26.py`,
mirrored in `server/init.py`, `LATEST_DB_VERSION = 26`).

Guiding rule: **nothing about how money, stock, profit or the ledgers are computed
changes.** Every new feature is expressed in the units the system already uses, so
analytics, FIFO profit, the cash running totals and the accounts ledger keep working
untouched.

---

## 1. Product packages (عبوات / كراتين)

### Problem
A pack of cigarettes sells for X; a carton of 10 sells for less than 10·X and often has
its own barcode. Same for water bottles/shrink packs, eggs/trays, cans/boxes, etc.

### Model
- A product keeps **one base unit** (what `stock` counts). Packages are *named multiples*
  of that unit with their own price and optional barcode.
- `product_packages(id, product_id, name, units, price, bar_code, is_deleted, created_at)`
  - `units` ≥ 2 (a package of 1 is just the product).
  - `price` is the selling price of the whole package (fixed — not a %, because that is what
    shops print and think in).
  - `bar_code` optional, unique among active packages and never equal to a product barcode
    (checked server-side both ways; the barcode generator skips package codes too).
  - Soft delete (`is_deleted`) so old bills keep resolving.
- Stock is still counted in base units. There is no package stock; a carton is "10 units".

### Bills (the key decision)
`products_flow` keeps `amount` in **base units** and `price`/`wholesale_price` **per unit**.
A package sale line additionally records a snapshot:
`package_id`, `package_units`, `package_name` (nullable columns).

So "2 cartons of 10 at 95" is stored as `amount = -20, price = 9.5` + the snapshot.
Everything that sums `amount`, `price*amount`, FIFO cost, batches, reservations, transfers
keeps working with zero changes. Display code shows the line as `2 × كرتونة (10) @ 95`.

The snapshot (not a live join) is what prints, so renaming/deleting a package or changing
its size never rewrites history.

### Cart behaviour (Sell, Admin sell, Buy, Move products)
- A cart line is identified by `(product_id, package_id|null)` — the same product can be on
  the bill as units **and** as cartons.
- In the cart, a package line holds `quantity` in packages and prices per package, so every
  existing total (`price × quantity`) is unchanged. Conversion to units happens once, when
  the bill is submitted (`cartLineToFlow`).
  - Sell types: unit price = package price ÷ units, unit cost = package cost ÷ units.
  - Buy/transfer: the cost column is per package (÷ units on submit); the *sell price*
    column stays the **unit** sell price (labelled "للوحدة") so buying a carton never
    reprices the single unit to the carton rate.
- Adding: scanning a package barcode adds that package; the product search lists packages
  as their own options ("مارلبورو — كرتونة (10)"). Each line has a unit switcher
  (الوحدة ▾) to flip a line between the base unit and any package.
- Stock hint per line shows units and the package equivalent: `متاح 125 = 12 كرتونة + 5`.
- **Suggest / auto-convert** (Settings → المظهر والواجهة → "العبوات في السلة"):
  - `اقتراح` (default): when a unit line reaches a package size, the line shows a one-tap
    chip "حوّل 10 إلى كرتونة — وفّر 5 ج".
  - `تلقائي`: the conversion happens by itself (10 units → 1 carton, 23 → 2 cartons + 3).
  - `إيقاف`.
  Conversion only ever applies to lines whose price is still the catalogue price (a cashier's
  manual price is never overridden).
- Persisted carts restore package lines with the current package price.

### Editing / corrections
- Normal edit (Bills admin → تعديل): package lines are shown and edited in packages; the
  snapshot is carried through `PUT /bill`.
- Bill corrections operate in base units (an admin tool). A kept line whose new quantity is
  no longer a whole number of packages drops its package snapshot and becomes a unit line.

### Products UI
- Products page & Products admin: each product row/card shows package chips and a
  "العبوات" dialog to add/edit/delete packages (name, units, price, barcode w/ generate,
  live "سعر الوحدة داخل العبوة" and savings vs. buying units).
- Warning (not a block) when a package costs ≥ units × unit price.

---

## 2. Attendance & salary (الحضور والانصراف)

### Goals
Zero-effort default (nothing changes for a store that never opens attendance), but complete
enough for monthly, daily and hourly workers, lateness and overtime.

### Employee settings (per employee)
- `pay_type`: `monthly` (salary = per month) · `daily` (salary = per day) · `hourly`
  (salary = per hour).
- `off_days`: weekly days off (0 = Sunday … 6 = Saturday).
- `daily_hours` (default 8) and optional `shift_start` (for lateness).
- `track_attendance` (default on). Off ⇒ the employee is paid as if always present.

### Store settings (`store_data.extra_info.attendance`)
| key | default | meaning |
|---|---|---|
| `unmarked_as` | `present` | a working day with no record counts as present or absent |
| `day_rate_basis` | `calendar30` | monthly day rate = salary ÷ 30, or ÷ working days in that month |
| `late_deduction` | `false` | deduct late minutes (after `late_grace_minutes`, default 15) at the hourly rate |
| `overtime_pay` | `false` | pay hours beyond `daily_hours` and work on days off, × `overtime_multiplier` (default 1.5) |

### Records
`employee_attendance(employee_id, day, status, check_in, check_out, note)` unique per
(employee, day). Status: `present` حاضر · `absent` غائب · `half` نصف يوم · `leave` إجازة
مدفوعة. Clearing a day deletes the record (back to "unmarked").

### Salary calculation (`GET /employees/{id}/salary-preview?start&end`)
Iterates every day of the period the employee was employed:
- monthly: base = Σ per month `salary × employed days / days in month` (a full month = salary).
  Absent day = −1 day rate, half day = −½ day rate, paid leave = 0.
- daily: earned = (present + leave) × rate + half × ½ rate. Days off are unpaid unless
  marked present.
- hourly: earned = worked hours (check-out − check-in; `daily_hours` when no times; half
  day = ½) × rate.
- lateness and overtime as per the settings.
Returns the breakdown, the suggested `amount` (base/earned), `deductions` (absence +
lateness) and `bonus` (overtime), plus any salaries already paid for an overlapping period.

### Paying
The pay dialog shows period (month picker or custom range), the breakdown, editable bonus /
deductions / amount, payment date (default now) and account. Saved with
`salaries.period_start/period_end/details/note`. Cash/ledger behaviour is unchanged (same
trigger). A warning (not a block) is shown when the period overlaps a previous payment.

### UI (Employee page, phone-first)
Tabs: **الموظفون** (cards: pay type, salary, today's status, actions) · **الحضور اليومي**
(date stepper, one row per employee, 4 big status buttons, "حضور الآن / انصراف الآن",
"تسجيل الباقي حاضر") · **سجل الرواتب** (history with period and breakdown) · settings
dialog. Per-employee month calendar with colored days and the running estimate.

---

## 3. Editing a bill's payment methods

- `PUT /bill/payments` (`server/bill_payments.py`): rewrites `bills.payments` in place
  (same idea as `PUT /bill/party`). Allowed for sell / return / buy / buy-return, not for a
  transfer pair. The split must sum to the bill total.
- It re-splits the bill's cash rows in the accounts ledger and keeps the off-store payment
  forwarding rows (accounts living in another store) in step — reusing the bill-corrections
  helpers, under the same per-store lock. Cash totals do not move (amount unchanged).
- Bills admin edit dialog gets a payment-split section. Save order: lines (`PUT /bill`,
  rescales proportionally) → party → payments (only if the user touched the split).

---

## 4. Phone UI/UX

The web build (`pnpm build:web` → FastAPI `/`) is the phone client. Pass over every page at
360–414 px: no horizontal page scroll, tables become cards where they are the main content,
dialogs go full-screen on phones, sticky bottom action bar on POS pages, safe-area insets,
16 px inputs (no iOS zoom), bigger touch targets, correct `inputMode`s, viewport/theme-color
meta, and a fixed Layout (hooks order bug when navigating to /login, no-op loading branch).

## 5. General UX & themes
New themes, consistent rounded surfaces, empty states, formatted money everywhere new.

## 6. Performance
- Route-level code splitting (`React.lazy`) — the phone downloads only the page it opens.
- `GET /bills`: installments aggregate limited to the requested bills (it aggregated every
  installment in the DB on every call).
- Product search renders at most 100 options; barcode lookup is a map (O(1)).
- Pooled DB connections (`psycopg2` ThreadedConnectionPool) instead of a new TCP + auth
  handshake per request.

## Update path
1. Pull, `python update_db_26.py` (idempotent), restart backend.
2. Desktop: new build. Phone: `./deploy-web.sh` (or `pnpm build:web`).
Nothing needs configuring; packages and attendance are opt-in by use.
