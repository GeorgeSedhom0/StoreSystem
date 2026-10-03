"""
FIFO realized profit, shared by the income and detailed analytics.

For every product sold or returned in the period we replay the product's full
stock history in the store, oldest first, keeping a queue of cost layers:

- Every stock increase is a layer at the cost recorded on that row: buys,
  moves in, customer returns, and manual stock edits (bill -1).
- Every stock decrease consumes the oldest layers: sells, moves out,
  buy-returns, manual stock edits.
- Selling more than the queue holds (stock went negative) costs the missing
  units at the cost recorded on the sale line, and the next increase fills
  that hole before it becomes a layer. Nothing is borrowed from later buys,
  so a sale's cost never depends on the date range being viewed.

Profit is counted for sells to non-store parties, net of the bill discount
(spread over the bill's lines by value). A customer return in the period
takes back its line's profit at the return's recorded cost.

Edited bills: the bill keeps its id and its time, its current rows are what
counts; the -<id> bill holding the old rows and their reversals nets to zero
and is skipped. Event time is the bill time, so a sale lands in the same day
or shift as its bill (row times move when a bill is edited).
"""

from collections import deque
from datetime import datetime
from typing import Dict, List, Optional


def compute_fifo_profit(
    cur,
    store_id: int,
    start_dt: datetime,
    end_dt: datetime,
    party_id: Optional[int] = None,
) -> Dict[int, Dict]:
    """
    Realized FIFO profit per product for sells/returns with
    start_dt <= bill time < end_dt.

    Returns {product_id: {total_profit, total_sales_value, total_units_sold,
    total_cost, profit_events: [(time, profit), ...]}}. `cur` must be a
    RealDictCursor.
    """
    cur.execute(
        """
        SELECT DISTINCT pf.product_id
        FROM products_flow pf
        JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
        LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
        WHERE pf.store_id = %s AND b.id > 0
          AND b.type IN ('sell', 'return')
          AND b.time >= %s AND b.time < %s
          AND (b.party_id IS NULL OR ap.type != 'store')
          AND (%s IS NULL OR b.party_id = %s)
        """,
        (store_id, start_dt, end_dt, party_id, party_id),
    )
    product_ids = [int(r["product_id"]) for r in cur.fetchall()]
    if not product_ids:
        return {}

    # Bill discount as a fraction of the bill's gross line value.
    cur.execute(
        """
        SELECT b.id, b.discount, SUM(ABS(pf.amount) * pf.price) AS gross
        FROM bills b
        JOIN products_flow pf ON pf.bill_id = b.id AND pf.store_id = b.store_id
        WHERE b.store_id = %s AND b.id > 0
          AND b.type IN ('sell', 'return')
          AND b.time >= %s AND b.time < %s
          AND COALESCE(b.discount, 0) <> 0
        GROUP BY b.id, b.discount
        """,
        (store_id, start_dt, end_dt),
    )
    discount_ratio = {
        int(r["id"]): float(r["discount"]) / float(r["gross"])
        for r in cur.fetchall()
        if r["gross"]
    }

    # Full history up to the period end. Bill -1 (manual stock edits) has no
    # time of its own, so its rows use the row time.
    cur.execute(
        """
        SELECT pf.product_id, pf.bill_id, pf.amount, pf.wholesale_price, pf.price,
               COALESCE(b.time, pf.time) AS t, b.type, b.party_id,
               ap.type AS party_type
        FROM products_flow pf
        LEFT JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
        LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
        WHERE pf.store_id = %s AND pf.product_id IN %s
          AND pf.bill_id >= -1
          AND COALESCE(b.time, pf.time) < %s
        ORDER BY pf.product_id, COALESCE(b.time, pf.time), pf.id
        """,
        (store_id, tuple(product_ids), end_dt),
    )
    rows = cur.fetchall()

    result: Dict[int, Dict] = {}
    pid = None
    layers: deque = deque()  # [cost, qty]
    deficit = 0.0  # units sold beyond stock, already costed
    stats: Dict = {}

    for r in rows:
        if r["product_id"] != pid:
            pid = int(r["product_id"])
            layers = deque()
            deficit = 0.0
            stats = {
                "product_id": pid,
                "total_profit": 0.0,
                "total_sales_value": 0.0,
                "total_units_sold": 0.0,
                "total_cost": 0.0,
                "profit_events": [],
            }
            result[pid] = stats

        amount = float(r["amount"] or 0)
        cost = float(r["wholesale_price"] or 0)
        btype = r["type"]
        counts = (
            btype in ("sell", "return")
            and start_dt <= r["t"] < end_dt
            and r["party_type"] != "store"
            and (party_id is None or r["party_id"] == party_id)
        )
        net_price = float(r["price"] or 0) * (
            1.0 - discount_ratio.get(int(r["bill_id"]), 0.0)
        )

        if amount > 0:
            qty = amount
            filled = min(deficit, qty)
            deficit -= filled
            if qty - filled > 1e-9:
                layers.append([cost, qty - filled])
            if counts and btype == "return":
                profit = -(net_price - cost) * qty
                stats["total_profit"] += profit
                stats["total_sales_value"] -= net_price * qty
                stats["total_units_sold"] -= qty
                stats["total_cost"] -= cost * qty
                stats["profit_events"].append((r["t"], profit))

        elif amount < 0:
            qty = -amount
            need = qty
            fifo_cost = 0.0
            while need > 1e-9 and layers:
                layer = layers[0]
                take = min(layer[1], need)
                fifo_cost += layer[0] * take
                layer[1] -= take
                need -= take
                if layer[1] <= 1e-9:
                    layers.popleft()
            if need > 1e-9:
                fifo_cost += cost * need
                deficit += need
            if counts and btype == "sell":
                profit = net_price * qty - fifo_cost
                stats["total_profit"] += profit
                stats["total_sales_value"] += net_price * qty
                stats["total_units_sold"] += qty
                stats["total_cost"] += fifo_cost
                stats["profit_events"].append((r["t"], profit))

    return result
