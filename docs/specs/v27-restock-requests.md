# v27 — Restock requests (طلبات البضاعة)

A store (usually a front) asks another store (usually the storage) for goods.
The storage prepares them through the existing **Move Products** transfer, and
the request tracks what was sent, what is still missing and what happened to it.

## Goals

- The requester says *what* and *how much*. They never see the supplier's stock.
- The supplier sees incoming requests, prints a pick list and starts a transfer
  from them. The quantities are auto-filled with what is actually available.
- When several stores want the same product and there isn't enough, the system
  suggests a fair split: by each store's own sales rate, so everyone runs out
  at about the same time.
- Nothing gets lost: unfilled items stay visible and can be carried into the
  next request in one click, and duplicate asking is flagged.
- The transfer itself is unchanged. Requests only *link* to transfers.

## Words

| Term | Meaning |
|---|---|
| requester (`from_store_id`) | the store asking |
| supplier (`to_store_id`) | the store asked (picked by the requester) |
| line | one product + requested quantity (base units; package snapshot for display) |
| sent | Σ quantities recorded from linked transfers (never more than requested per line) |
| remaining | requested − sent |

## Lifecycle

Only two stored states: `open` and `closed`. Everything users see is derived:

| Stored | Condition | Shown as |
|---|---|---|
| open | nothing sent | جديد (and «تم الاطلاع» once the supplier opened it) |
| open | some sent | جزئي |
| closed | everything sent | مكتمل (closed automatically) |
| closed | nothing sent, closed by requester | ملغي |
| closed | something remaining | مغلق بنقص |

Transitions:

- **Create** (requester). Notifies the supplier: in-app plus Telegram.
- **Edit** (requester, while open). Add, remove or change lines. A line can't go
  below what was already sent. The supplier can change only while nothing was sent.
- **Fulfil** (supplier, through Move Products linked to the request). Sent
  quantities are allocated to the linked requests oldest first, capped at
  remaining. A request whose every line is fully sent closes automatically.
  The requester is notified.
- **Close** (either side, with an optional note). Used for "can't fill the
  rest" or "no longer needed". The requester is notified when the supplier
  closes with items missing.
- **Reopen** (either side). Only when it was closed with items remaining and
  the remaining items weren't already carried into another request.
- **Carry over** (requester). Copy the remaining items of closed requests into
  the new-request cart. When that new request is submitted, the old ones are
  marked as followed up, so the reminder stops.
  **Dismiss** marks them followed up without copying.

## What the system encourages, allows, and leaves alone

| Behaviour | Treatment |
|---|---|
| Asking for something already pending in an open request | **Flagged** on the line: «مطلوب بالفعل 5 في طلب #12». Still allowed. |
| Submitting a second request to the same supplier while one is untouched | **Encouraged to merge**: dialog defaults to «إضافة للطلب #N». |
| Forgetting unfilled items from closed requests | **Reminded** on the new-request tab with one-click carry-over or dismiss. |
| Supplier transferring without linking a request | **Nudged**: Move Products shows «لهذا المتجر N طلب مفتوح — ربط». |
| Leaving a partly filled request open forever | After a linked transfer, the supplier gets an explicit choice: keep it open or close it with the missing items. |
| Over-sending more than requested | Allowed (it's just a transfer); only the requested amount counts. |
| Overriding the suggested split | Allowed: the auto-fill is just a cart. |
| Editing or deleting the linked transfer later (bill corrections) | Not tracked back. The request keeps what was recorded. Documented, not helped. |
| Receiving confirmation at the requester | Not added. A transfer already lands stock immediately; adding a receipt step would change transfer semantics. |

## Split suggestion

For every product with remaining quantity in open incoming requests:

- `A` = supplier stock. `r_i` = remaining for store *i* (summed over its open
  requests).
- `s_i` = that store's current stock. `u_i` = its daily sales over the last 30
  days. That is net of returns and excludes transfers (bills whose party is a
  store).
- If `A ≥ Σ r_i`: everyone gets `r_i`.
- Else, if every store has `u_i > 0`: **equalize days of cover**. Find the
  level `T` with `Σ min(r_i, max(0, T·u_i − s_i)) = A`, then give each store
  `min(r_i, max(0, T·u_i − s_i))`. Shown as «حسب الاستهلاك».
- Else: **proportional to the request**, `A · r_i / Σ r`. Shown as «بنسبة الطلب».
- Integer rounding: floor everything, then hand out leftovers by largest
  fraction, without exceeding `r_i`.

The plan is computed server-side (`GET /restock/plan`). It is shown in the
incoming tab's "by product" view and used by Move Products auto-fill. When a
product isn't contested, the auto-fill is simply `min(remaining, available)`.

## Data (v27)

```
restock_requests(id, from_store_id, to_store_id, status open|closed, note,
  created_by, created_at, updated_at, seen_at, closed_at, closed_by,
  closed_side requester|supplier|auto, close_note,
  followed_up_at, followup_request_id)
restock_request_lines(id, request_id, product_id, quantity INT>0,
  package_id, package_units, package_name, UNIQUE(request_id, product_id))
restock_fulfillments(id, request_id, line_id, bill_id, store_id, quantity, created_at)
```

- A transfer's link is its source (supplier-side) bill: `(bill_id, store_id)`.
- New page `/restock-requests` («طلبات البضاعة»). The migration grants it to
  `admin` and to every scope that already has `/admin/move-products`.
- The server checks that the page is in the user's scope (same pattern as
  bill corrections).

## API (`server/restock.py`)

| Method | Path | Who |
|---|---|---|
| GET | `/restock/requests?store_id&box=mine\|incoming&state=open\|closed\|all` | page |
| GET | `/restock/requests/{id}?store_id` (supplier gets `available`) | either side |
| POST | `/restock/requests` `{store_id,to_store_id,note,lines,carry_from,merge_into}` | requester |
| PUT | `/restock/requests/{id}` `{store_id,to_store_id?,note,lines}` | requester |
| POST | `/restock/requests/{id}/close` `{store_id,note}` | either |
| POST | `/restock/requests/{id}/reopen` `{store_id}` | either |
| POST | `/restock/requests/{id}/seen?store_id` | supplier |
| POST | `/restock/followups/dismiss` `{store_id, ids}` | requester |
| GET | `/restock/pending?store_id` (my open remaining per product, closed-with-remaining to follow up) | requester |
| GET | `/restock/usage?store_id` (daily sales per product) | requester hints |
| GET | `/restock/plan?store_id` | supplier |
| POST | `/admin/move-products?…&restock_request_ids=1&restock_request_ids=2` | existing, plus linking |

The `move-products` response gains `restock: [{id, remaining_lines, closed}]`.

## UI

Page **طلبات البضاعة** with three tabs (remembered per store):

1. **طلب جديد**:
   - Pick the supplier (remembered, or automatic when there's only one other store).
   - Search or scan products, with packages.
   - Each line shows the quantity (with a unit switch), «عندك X» (own stock),
     «تبيع ~Y/يوم», and the already-requested flag.
   - A note for the whole request.
   - Draft kept locally.
   - Carry-over banner.
   - On phones the checkout bar becomes «إرسال الطلب».
2. **طلباتي**: request cards with derived status and a progress bar. Details:
   - lines with requested, sent and remaining, and the linked transfers;
   - actions: edit, cancel/close, copy what's missing, copy everything, print.
3. **الوارد**:
   - Requests addressed to this store, with an unread marker.
   - Toggle between «حسب الطلب» and «حسب المنتج» (the split view).
   - Details show stock available here.
   - Actions: «تجهيز في نقل المنتجات» (only if the user has that page),
     print pick list (receipt and A4 PDF), close with a note, reopen.

Move Products:

- «ابدأ من طلب»: pick one or more open requests from one store. This sets the
  destination, merges the auto-filled lines into the cart, links the requests
  and lists anything unavailable.
- The linked chips can be removed. Changing the destination store unlinks them.
- The link nudge described above.
- After the transfer: a summary showing what's still missing per request, with
  «إبقاء مفتوح» / «إغلاق».
- Deep link `#/admin/move-products?restock=12,13` from the incoming tab.

## Overengineering check

Dropped:

- Server-side drafts. A local persistent cart already does this.
- Per-line notes. One request note is enough.
- Per-line "unavailable" marks by the supplier. Closing plus carry-over covers it.
- A configurable split policy. One good default with a fallback, shown and
  overrideable.
- Receipt confirmation, priorities/urgency, due dates, approval chains, and
  editing history of a request.

Kept, because each is cheap and directly prevents a stated pain:

- `seen_at` (stops "did you get it?" calls).
- The fulfilments table (shows *which* transfer filled what, and the sent
  quantities can't drift from what was recorded).
- Follow-up tracking (the stated "come back later and see what wasn't filled").
- Merge-on-submit (stated "avoid back noise").

## Added during build

- **«اقتراحات»** on the new-request tab: products this store sells that run
  out within 3 days at its own 30-day sales rate, with enough suggested for 7
  days. Computed client-side from the store's own stock and the usage endpoint
  (no supplier data). This was the cheapest way to answer "what do I need?",
  which is most of the requester's work.
- Store clock fix (same release): server-stamped times use `clock.local_now()`.
