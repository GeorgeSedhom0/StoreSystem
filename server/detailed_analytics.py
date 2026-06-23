from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from dotenv import load_dotenv
from os import getenv
from typing import Optional, List, Dict
import pandas as pd
from utils import parse_date
from analytics_utils import Database
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()


@router.get("/detailed-analytics")
async def get_detailed_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    by_shift: bool = False,
    party_id: Optional[int] = None,
    current_user: Dict = Depends(get_current_user),
):
    # Normalize input dates
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    start_dt = parse_date(start_date)
    end_dt = parse_date(end_date)
    end_dt_next = end_dt + timedelta(days=1)  # exclusive upper bound

    # Cards: clear, separated money categories for the period.
    def fetch_card_metrics() -> Dict:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # (1) Bill-based sales & supplier purchases. Inter-store parties are
            # excluded here — they're reported separately as inter-store transfers.
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(b.total) FILTER (WHERE b.type IN ('sell','return')), 0) AS total_sales,
                    COALESCE(-SUM(b.total) FILTER (WHERE b.type IN ('buy','buy-return')), 0) AS purchases
                FROM bills b
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE b.store_id = %s
                  AND b.time >= %s AND b.time < %s
                  AND (b.party_id IS NULL OR ap.type != 'store')
                  AND (%s IS NULL OR b.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r1 = cur.fetchone() or {}

            # (2) Deferred sales — outstanding value + expected profit, computed
            # per bill from products_flow (BNPL/installment store total=0). Cost
            # basis = the wholesale_price locked on the line at sale time, so the
            # "expected profit" is the margin on those exact goods.
            #   BNPL: type stays 'BNPL' only while unrealized (it flips to 'sell'
            #   on payment), so these are exactly the not-yet-collected ones.
            cur.execute(
                """
                SELECT
                    COALESCE(-SUM(pf.price * pf.amount) FILTER (WHERE b.type = 'BNPL'), 0) AS bnpl_outstanding,
                    COALESCE(-SUM((pf.price - pf.wholesale_price) * pf.amount) FILTER (WHERE b.type = 'BNPL'), 0) AS bnpl_expected_profit,
                    COALESCE(-SUM(pf.price * pf.amount) FILTER (WHERE b.type = 'installment'), 0) AS installment_principal,
                    COALESCE(-SUM((pf.price - pf.wholesale_price) * pf.amount) FILTER (WHERE b.type = 'installment'), 0) AS installment_expected_profit
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE pf.store_id = %s AND b.id > 0
                  AND b.time >= %s AND b.time < %s
                  AND b.type IN ('BNPL', 'installment')
                  AND (b.party_id IS NULL OR ap.type != 'store')
                  AND (%s IS NULL OR b.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r2 = cur.fetchone() or {}

            # (3) Installment cash collected to date (مقدم + قسط) against the
            # installment bills that were CREATED in the period. principal =
            # collected + remaining, so remaining is derived in Python.
            cur.execute(
                """
                SELECT COALESCE(SUM(cf.amount), 0) AS installment_collected
                FROM cash_flow cf
                JOIN bills b ON cf.bill_id = b.id AND cf.store_id = b.store_id
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE cf.store_id = %s
                  AND cf.description IN ('مقدم', 'قسط')
                  AND b.type = 'installment'
                  AND b.time >= %s AND b.time < %s
                  AND (b.party_id IS NULL OR ap.type != 'store')
                  AND (%s IS NULL OR b.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r3 = cur.fetchone() or {}

            # (4) Operating expenses: non-bill cash OUT that is NOT an inter-store
            # transfer and NOT an owner withdrawal (salaries + manual expenses).
            cur.execute(
                """
                SELECT COALESCE(-SUM(cf.amount), 0) AS operating_expenses
                FROM cash_flow cf
                LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                  AND cf.amount < 0 AND cf.bill_id IS NULL
                  AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
                  AND (%s IS NULL OR cf.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r4 = cur.fetchone() or {}

            # (5) Inter-store and owner movements, kept apart from everything else.
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(cf.amount) FILTER (WHERE ap.type = 'store'), 0) AS interstore_net,
                    COALESCE(SUM(cf.amount) FILTER (WHERE ap.type = 'owner' AND cf.amount > 0), 0) AS owner_in,
                    COALESCE(-SUM(cf.amount) FILTER (WHERE ap.type = 'owner' AND cf.amount < 0), 0) AS owner_out,
                    COALESCE(SUM(cf.amount) FILTER (WHERE ap.type = 'owner'), 0) AS owner_net
                FROM cash_flow cf
                JOIN assosiated_parties ap ON cf.party_id = ap.id
                WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                  AND ap.type IN ('store', 'owner')
                  AND (%s IS NULL OR cf.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r5 = cur.fetchone() or {}

            # (6) Free cash: manual cash IN with no bill, not from another store
            # and not from the owner — surplus found in the drawer. Pure profit.
            cur.execute(
                """
                SELECT COALESCE(SUM(cf.amount), 0) AS free_cash
                FROM cash_flow cf
                LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                  AND cf.type = 'in' AND cf.amount > 0 AND cf.bill_id IS NULL
                  AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
                  AND (%s IS NULL OR cf.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            r6 = cur.fetchone() or {}

            installment_principal = float(r2.get("installment_principal") or 0)
            installment_collected = float(r3.get("installment_collected") or 0)
            return {
                "total_sales": float(r1.get("total_sales") or 0),
                "purchases": float(r1.get("purchases") or 0),
                "bnpl_outstanding": float(r2.get("bnpl_outstanding") or 0),
                "bnpl_expected_profit": float(r2.get("bnpl_expected_profit") or 0),
                "installment_principal": installment_principal,
                "installment_collected": installment_collected,
                "installment_remaining": installment_principal - installment_collected,
                "installment_expected_profit": float(
                    r2.get("installment_expected_profit") or 0
                ),
                "operating_expenses": float(r4.get("operating_expenses") or 0),
                "free_cash": float(r6.get("free_cash") or 0),
                "interstore_net": float(r5.get("interstore_net") or 0),
                "owner_in": float(r5.get("owner_in") or 0),
                "owner_out": float(r5.get("owner_out") or 0),
                "owner_net": float(r5.get("owner_net") or 0),
            }

    # Products participating in sells in period (exclude internal store)
    def get_products_sold_in_period() -> List[int]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT DISTINCT pf.product_id
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE pf.store_id = %s
                  AND b.type = 'sell' AND pf.amount < 0 AND b.id > 0
                  AND b.time >= %s AND b.time < %s
                  AND (b.party_id IS NULL OR ap.type != 'store')
                  AND (%s IS NULL OR b.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            return [int(r["product_id"]) for r in cur.fetchall()]

    def get_product_meta(product_ids: List[int]) -> Dict[int, Dict]:
        if not product_ids:
            return {}
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT p.id, p.name, p.price, p.wholesale_price
                FROM products p
                WHERE p.id IN %s
                """,
                (tuple(product_ids),),
            )
            return {
                int(r["id"]): {
                    "name": r["name"],
                    "price": float(r["price"] or 0),
                    "wholesale_price": float(r["wholesale_price"] or 0),
                }
                for r in cur.fetchall()
            }

    # FIFO per product
    def compute_fifo_profit_for_product(product_id: int):
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT pf.time
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.product_id = %s AND pf.store_id = %s AND b.id > 0
                  AND b.time < %s AND pf.total = 0
                ORDER BY pf.time DESC LIMIT 1
                """,
                (product_id, store_id, start_dt),
            )
            sp = cur.fetchone()
            if sp:
                fifo_start_time = sp["time"]
            else:
                cur.execute(
                    """
                    SELECT MIN(pf.time) AS min_time
                    FROM products_flow pf
                    JOIN bills b ON pf.bill_id = b.id
                    WHERE pf.product_id = %s AND pf.store_id = %s AND b.id > 0
                    """,
                    (product_id, store_id),
                )
                res = cur.fetchone()
                fifo_start_time = (
                    res["min_time"] if res and res["min_time"] else start_dt
                )

            # Transactions in window
            cur.execute(
                """
                SELECT pf.time, pf.amount, pf.wholesale_price, pf.price,
                       b.type, b.party_id, ap.type as party_type
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE pf.product_id = %s AND pf.store_id = %s AND b.id > 0
                  AND pf.time >= %s AND pf.time < %s
                  AND b.type IN ('sell','buy')
                ORDER BY pf.time
                """,
                (product_id, store_id, fifo_start_time, end_dt_next),
            )
            transactions = [dict(t) for t in cur.fetchall()]

            # Future purchases after the period
            cur.execute(
                """
                SELECT pf.time, pf.amount, pf.wholesale_price
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.product_id = %s AND pf.store_id = %s AND b.id > 0
                  AND pf.time > %s AND b.type = 'buy' AND pf.amount > 0
                ORDER BY pf.time
                """,
                (product_id, store_id, end_dt),
            )
            future_purchases = cur.fetchall()

        inv: List[tuple[float, float]] = []
        future_inv: List[tuple[float, float]] = [
            (float(fp["wholesale_price"] or 0), float(fp["amount"]))
            for fp in future_purchases
        ]
        daily_profit: Dict[str, float] = {}
        profit_events: List[tuple] = []  # (timestamp, profit) per sale, for shift bucketing
        total_profit = 0.0
        total_sales_value = 0.0
        total_units_sold = 0.0
        accumulated_cost_for_sold = 0.0
        last_known_cost = None

        def remove_from_inv(qty: float):
            remaining = qty
            while remaining > 1e-9 and inv:
                cost, q = inv[0]
                if q <= remaining + 1e-9:
                    remaining -= q
                    inv.pop(0)
                else:
                    inv[0] = (cost, q - remaining)
                    remaining = 0.0

        for i, tr in enumerate(transactions):
            dt = tr["time"]
            date_str = dt.strftime("%Y-%m-%d")
            amount = float(tr["amount"] or 0)
            w_cost = float(tr["wholesale_price"] or 0)
            s_price = float(tr["price"] or 0)
            btype = tr["type"]
            party_type = tr.get("party_type")
            in_period = (start_dt <= dt) and (dt < end_dt_next)

            include_for_profit = btype == "sell" and party_type != "store" and in_period
            # When a specific party is selected, only count that party's sales as
            # profit; other sales still consume inventory so FIFO cost layers stay
            # correct. With no party selected this equals include_for_profit.
            counts_profit = include_for_profit and (
                party_id is None or tr["party_id"] == party_id
            )

            if btype == "buy" and amount > 0:
                inv.append((w_cost, amount))
                last_known_cost = w_cost or last_known_cost
                continue

            if btype == "sell" and amount < 0:
                sell_qty = -amount
                if counts_profit:
                    total_sales_value += s_price * sell_qty
                    total_units_sold += sell_qty
                else:
                    remove_from_inv(sell_qty)
                    continue

                remaining = sell_qty
                sale_profit = 0.0

                # From current inventory
                while remaining > 1e-9 and inv:
                    cost, q = inv[0]
                    take = min(q, remaining)
                    sale_profit += (s_price - cost) * take
                    accumulated_cost_for_sold += cost * take
                    q -= take
                    remaining -= take
                    if q <= 1e-9:
                        inv.pop(0)
                    else:
                        inv[0] = (cost, q)

                # Borrow from later buys within the period
                if remaining > 1e-9:
                    future_within: List[tuple[float, float]] = []
                    for j in range(i + 1, len(transactions)):
                        fut = transactions[j]
                        if fut["type"] == "buy" and float(fut["amount"] or 0) > 0:
                            future_within.append(
                                (
                                    float(fut["wholesale_price"] or 0),
                                    float(fut["amount"]),
                                )
                            )
                    fw_idx = 0
                    while remaining > 1e-9 and fw_idx < len(future_within):
                        cost, q = future_within[fw_idx]
                        take = min(q, remaining)
                        sale_profit += (s_price - cost) * take
                        accumulated_cost_for_sold += cost * take
                        q -= take
                        remaining -= take
                        future_within[fw_idx] = (cost, q)
                        if q <= 1e-9:
                            fw_idx += 1
                    # write back remaining amounts to transactions
                    fw_idx = 0
                    for j in range(i + 1, len(transactions)):
                        fut = transactions[j]
                        if fut["type"] == "buy" and float(fut["amount"] or 0) > 0:
                            if fw_idx < len(future_within):
                                _, rem = future_within[fw_idx]
                                transactions[j] = dict(transactions[j])
                                transactions[j]["amount"] = rem
                                fw_idx += 1

                # Borrow from purchases after the period
                while remaining > 1e-9 and future_inv:
                    cost, q = future_inv[0]
                    take = min(q, remaining)
                    sale_profit += (s_price - cost) * take
                    accumulated_cost_for_sold += cost * take
                    q -= take
                    remaining -= take
                    if q <= 1e-9:
                        future_inv.pop(0)
                    else:
                        future_inv[0] = (cost, q)

                # Fallback
                if remaining > 1e-9 and last_known_cost is not None:
                    sale_profit += (s_price - last_known_cost) * remaining
                    accumulated_cost_for_sold += last_known_cost * remaining
                    remaining = 0.0

                total_profit += sale_profit
                daily_profit[date_str] = daily_profit.get(date_str, 0.0) + sale_profit
                profit_events.append((dt, sale_profit))

        avg_cost_per_unit = (
            (accumulated_cost_for_sold / total_units_sold)
            if total_units_sold > 0
            else 0.0
        )
        return {
            "product_id": product_id,
            "daily_profit": daily_profit,
            "profit_events": profit_events,
            "total_profit": total_profit,
            "total_sales_value": total_sales_value,
            "total_units_sold": total_units_sold,
            "avg_cost_per_unit": avg_cost_per_unit,
        }

    def compute_fifo_once_and_aggregate(shift_windows: Optional[List] = None):
        product_ids = get_products_sold_in_period()
        meta = get_product_meta(product_ids)

        overall_daily_profit: Dict[str, float] = {}
        all_profit_events: List[tuple] = []
        per_product: Dict[int, Dict] = {}
        total_profit_fifo = 0.0

        for pid in product_ids:
            stats = compute_fifo_profit_for_product(pid)
            per_product[pid] = stats
            total_profit_fifo += stats["total_profit"]
            for d, p in stats["daily_profit"].items():
                overall_daily_profit[d] = overall_daily_profit.get(d, 0.0) + p
            all_profit_events.extend(stats["profit_events"])

        if shift_windows is not None:
            # Bucket profit by shift (x-axis = shift end times)
            profit_series = bucket_by_shift(all_profit_events, shift_windows)
        else:
            all_dates = pd.date_range(
                start=start_dt.date(), end=end_dt.date(), freq="D"
            )
            profit_series = [
                [
                    d.strftime("%Y-%m-%d"),
                    float(overall_daily_profit.get(d.strftime("%Y-%m-%d"), 0.0)),
                ]
                for d in all_dates
            ]

        top = sorted(
            (
                {
                    "product_id": pid,
                    "name": meta.get(pid, {}).get("name", f"#{pid}"),
                    "total_units_sold": per_product[pid]["total_units_sold"],
                    "total_sales_value": per_product[pid]["total_sales_value"],
                    "total_profit_fifo": per_product[pid]["total_profit"],
                    "realized_margin_pct": (
                        (
                            per_product[pid]["total_profit"]
                            / per_product[pid]["total_sales_value"]
                        )
                        * 100.0
                        if per_product[pid]["total_sales_value"] > 0
                        else 0.0
                    ),
                    "avg_cost_per_unit": per_product[pid]["avg_cost_per_unit"],
                    "current_price": meta.get(pid, {}).get("price", 0.0),
                    "current_price_margin_pct": (
                        (
                            (
                                meta.get(pid, {}).get("price", 0.0)
                                - per_product[pid]["avg_cost_per_unit"]
                            )
                            / max(meta.get(pid, {}).get("price", 0.0), 1e-9)
                        )
                        * 100.0
                    ),
                }
                for pid in per_product
            ),
            key=lambda x: x["total_profit_fifo"],
            reverse=True,
        )[:5]

        return total_profit_fifo, profit_series, top

    def fetch_clients_analytics() -> Dict:
        """
        Fetch client analytics: categorize clients by their purchase history
        and get top clients by total purchases in the period.
        """
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get clients with their period totals and prior purchase count
            # Only count sell/return bills (not buy bills) and exclude store-type parties
            cur.execute(
                """
                SELECT b.party_id,
                       ap.name AS party_name,
                       ap.phone AS party_phone,
                       COALESCE(SUM(b.total), 0) AS period_total,
                       COUNT(*) AS period_bills_count,
                       COALESCE((
                           SELECT COUNT(*) FROM bills b2
                           WHERE b2.store_id = b.store_id
                             AND b2.party_id = b.party_id
                             AND b2.type IN ('sell', 'return')
                             AND b2.time < %s
                       ), 0) AS prior_count
                FROM bills b
                JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE b.store_id = %s
                  AND b.type IN ('sell', 'return')
                  AND b.time >= %s AND b.time < %s
                  AND b.party_id IS NOT NULL
                  AND ap.type != 'store'
                  AND (%s IS NULL OR b.party_id = %s)
                GROUP BY b.party_id, b.store_id, ap.name, ap.phone
                """,
                (start_dt, store_id, start_dt, end_dt_next, party_id, party_id),
            )
            rows = cur.fetchall()

        categories = {
            "new": {"count": 0, "total_sales": 0.0},
            "returning_lt5": {"count": 0, "total_sales": 0.0},
            "loyal_gte5": {"count": 0, "total_sales": 0.0},
        }

        # Build list of all clients with their totals for the top clients table
        all_clients = []

        for r in rows:
            row_party_id = r["party_id"]
            if row_party_id is None:
                continue
            total = float(r["period_total"] or 0)
            prior = int(r["prior_count"] or 0)
            bills_count = int(r["period_bills_count"] or 0)

            # Categorize by prior purchase history
            if prior == 0:
                cat = "new"
            elif prior < 5:
                cat = "returning_lt5"
            else:
                cat = "loyal_gte5"
            categories[cat]["count"] += 1
            categories[cat]["total_sales"] += total

            # Add to all clients list
            all_clients.append({
                "party_id": row_party_id,
                "name": r["party_name"] or "غير معروف",
                "phone": r["party_phone"] or "",
                "total": total,
                "bills_count": bills_count,
                "prior_count": prior,
                "category": cat,
            })

        # Sort by total descending to get top clients
        all_clients.sort(key=lambda x: x["total"], reverse=True)

        return {
            "categories": categories,
            "all_clients": all_clients,
        }

    def fetch_payment_method_breakdown() -> List[Dict]:
        """
        Aggregate sell/return bill amounts per payment method in the period.
        Return amounts subtract (money out). Store-internal parties are excluded.
        """
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    elem->>'name' AS method,
                    COALESCE(SUM(
                        (elem->>'amount')::numeric
                        * CASE WHEN b.type = 'return' THEN -1 ELSE 1 END
                    ), 0) AS total,
                    COUNT(DISTINCT b.id) AS bills_count
                FROM bills b
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                CROSS JOIN LATERAL jsonb_array_elements(b.payments) elem
                WHERE b.store_id = %s
                  AND b.time >= %s AND b.time < %s
                  AND b.type IN ('sell', 'return')
                  AND b.payments IS NOT NULL
                  AND (b.party_id IS NULL OR ap.type != 'store')
                  AND (%s IS NULL OR b.party_id = %s)
                GROUP BY elem->>'name'
                ORDER BY total DESC
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            return [
                {
                    "method": r["method"] or "غير معروف",
                    "total": float(r["total"] or 0),
                    "bills_count": int(r["bills_count"] or 0),
                }
                for r in cur.fetchall()
            ]

    def fetch_cashflow_in_vs_out() -> List[List]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                WITH date_series AS (
                    SELECT generate_series(%s::timestamp, %s::timestamp, '1 day'::interval)::date AS day
                ), agg AS (
                    SELECT DATE_TRUNC('day', cf.time)::date AS day,
                           SUM(CASE WHEN cf.type = 'in' THEN cf.amount ELSE 0 END) AS cash_in,
                           SUM(CASE WHEN cf.type = 'out' THEN -cf.amount ELSE 0 END) AS cash_out
                    FROM cash_flow cf
                    LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                    WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                      AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
                      AND (%s IS NULL OR cf.party_id = %s)
                    GROUP BY DATE_TRUNC('day', cf.time)::date
                )
                SELECT ds.day, COALESCE(a.cash_in, 0) AS cash_in, COALESCE(a.cash_out, 0) AS cash_out
                FROM date_series ds
                LEFT JOIN agg a ON ds.day = a.day
                ORDER BY ds.day
                """,
                (
                    start_dt.strftime("%Y-%m-%d"),
                    end_dt.strftime("%Y-%m-%d"),
                    store_id,
                    start_dt,
                    end_dt_next,
                    party_id,
                    party_id,
                ),
            )
            return [
                [
                    r["day"].strftime("%Y-%m-%d"),
                    float(r["cash_in"] or 0),
                    float(r["cash_out"] or 0),
                ]
                for r in cur.fetchall()
            ]

    def fetch_cash_in_series_only() -> List[List]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                WITH date_series AS (
                    SELECT generate_series(%s::timestamp, %s::timestamp, '1 day'::interval)::date AS day
                ), agg AS (
                    SELECT DATE_TRUNC('day', cf.time)::date AS day,
                           SUM(CASE WHEN cf.type = 'in' THEN cf.amount ELSE 0 END) AS cash_in
                    FROM cash_flow cf
                    LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                    WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                      AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
                      AND (%s IS NULL OR cf.party_id = %s)
                    GROUP BY DATE_TRUNC('day', cf.time)::date
                )
                SELECT ds.day, COALESCE(a.cash_in, 0) AS cash_in
                FROM date_series ds
                LEFT JOIN agg a ON ds.day = a.day
                ORDER BY ds.day
                """,
                (
                    start_dt.strftime("%Y-%m-%d"),
                    end_dt.strftime("%Y-%m-%d"),
                    store_id,
                    start_dt,
                    end_dt_next,
                    party_id,
                    party_id,
                ),
            )
            return [
                [r["day"].strftime("%Y-%m-%d"), float(r["cash_in"] or 0)]
                for r in cur.fetchall()
            ]

    def compute_inventory_net_value_trend(by_shift: bool = False) -> List[List]:
        """
        Compute inventory net value trend using historical prices.

        We go FORWARD through time:
        - Start from the beginning with initial stock (current stock minus all movements)
        - Move forward, applying stock changes
        - When we hit a 'buy' bill, update the price for that product from that point onward

        Args:
            by_shift: If True, return data points at shift end times instead of daily.
        """
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get current stock and prices
            cur.execute(
                """
                SELECT pi.product_id, pi.stock, p.wholesale_price
                FROM product_inventory pi
                JOIN products p ON p.id = pi.product_id
                WHERE pi.store_id = %s AND pi.is_deleted = FALSE
                """,
                (store_id,),
            )
            inv_rows = cur.fetchall()
            current_stock = {
                int(r["product_id"]): float(r["stock"] or 0) for r in inv_rows
            }
            current_prices = {
                int(r["product_id"]): float(r["wholesale_price"] or 0) for r in inv_rows
            }

            # Get all products_flow records with bill type and wholesale_price
            # Sorted by time ASCENDING for forward processing
            cur.execute(
                """
                SELECT pf.product_id, pf.amount, pf.wholesale_price AS pf_wholesale_price,
                       b.time, b.type AS bill_type
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
                WHERE pf.store_id = %s AND b.id > 0
                ORDER BY b.time ASC
                """,
                (store_id,),
            )
            all_flow_rows = cur.fetchall()

            # Get the total net movement for each product (to calculate starting stock)
            cur.execute(
                """
                SELECT pf.product_id, COALESCE(SUM(pf.amount), 0) AS total_movement
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
                WHERE pf.store_id = %s AND b.id > 0
                GROUP BY pf.product_id
                """,
                (store_id,),
            )
            movement_rows = cur.fetchall()
            total_movements = {
                int(r["product_id"]): float(r["total_movement"] or 0) for r in movement_rows
            }

            # Get shifts if needed
            shifts_data = []
            if by_shift:
                cur.execute(
                    """
                    SELECT end_date_time
                    FROM shifts
                    WHERE store_id = %s
                      AND end_date_time IS NOT NULL
                      AND end_date_time >= %s
                      AND end_date_time < %s
                    ORDER BY end_date_time ASC
                    """,
                    (store_id, start_dt, end_dt_next),
                )
                shifts_data = cur.fetchall()

        # Build flow events list sorted by time ascending
        flow_events = []
        for r in all_flow_rows:
            flow_events.append({
                "time": r["time"],
                "product_id": int(r["product_id"]),
                "amount": float(r["amount"] or 0),
                "pf_wholesale_price": float(r["pf_wholesale_price"] or 0),
                "bill_type": r["bill_type"],
            })

        # Determine time points for the series
        if by_shift:
            time_points = [r["end_date_time"] for r in shifts_data]
        else:
            days = list(pd.date_range(start=start_dt.date(), end=end_dt.date(), freq="D"))
            time_points = [
                datetime.combine(d.date(), datetime.max.time().replace(microsecond=0))
                for d in days
            ]

        if not time_points:
            return []

        # Calculate initial stock (current stock - all movements = stock at the very beginning)
        all_pids = set(current_stock.keys()) | set(total_movements.keys())
        stock_state = {
            pid: current_stock.get(pid, 0.0) - total_movements.get(pid, 0.0)
            for pid in all_pids
        }

        # For initial prices, we need to find the first buy bill for each product
        # or use current price if no buy bills exist
        # We'll build this as we go forward - start with zeros and update on first buy
        price_state: Dict[int, float] = {}

        # Pre-scan to find the first buy price for each product
        first_buy_price: Dict[int, float] = {}
        for evt in flow_events:
            pid = evt["product_id"]
            if evt["bill_type"] == "buy" and pid not in first_buy_price and evt["pf_wholesale_price"] > 0:
                first_buy_price[pid] = evt["pf_wholesale_price"]

        # Initialize prices: use first buy price if available, otherwise current price
        for pid in all_pids:
            if pid in first_buy_price:
                price_state[pid] = first_buy_price[pid]
            else:
                price_state[pid] = current_prices.get(pid, 0.0)

        # Process forward through time
        series: List[List] = []
        flow_idx = 0

        for tp in time_points:
            # Apply all flow events up to and including this time point
            while flow_idx < len(flow_events) and flow_events[flow_idx]["time"] <= tp:
                evt = flow_events[flow_idx]
                pid = evt["product_id"]

                # If this is a buy bill, update the price BEFORE applying the stock change
                # This way the new stock from this buy uses the new price
                if evt["bill_type"] == "buy" and evt["pf_wholesale_price"] > 0:
                    price_state[pid] = evt["pf_wholesale_price"]

                # Apply stock change
                stock_state[pid] = stock_state.get(pid, 0.0) + evt["amount"]
                flow_idx += 1

            # Calculate total value at this time point
            total_value = 0.0
            for pid, qty in stock_state.items():
                total_value += qty * price_state.get(pid, 0.0)

            if by_shift:
                series.append([tp.isoformat(), float(total_value)])
            else:
                series.append([tp.strftime("%Y-%m-%d"), float(total_value)])

        return series

    def fetch_shift_windows() -> List[tuple]:
        """Closed shifts whose end falls within the period, ordered by start.
        Matches the x-axis points used by the inventory shift view so every
        shift-mode chart on the page shares the same buckets."""
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT start_date_time, end_date_time
                FROM shifts
                WHERE store_id = %s
                  AND end_date_time IS NOT NULL
                  AND end_date_time >= %s
                  AND end_date_time < %s
                ORDER BY start_date_time ASC
                """,
                (store_id, start_dt, end_dt_next),
            )
            return [(r["start_date_time"], r["end_date_time"]) for r in cur.fetchall()]

    def bucket_by_shift(events: List[tuple], shift_windows: List[tuple]) -> List[List]:
        """Sum (timestamp, value) events into shift windows. Returns one
        [shift_end_iso, total] point per shift, zero-filled, in order. Events
        outside any in-range shift are dropped (same semantics as the inventory
        shift view)."""
        sums = {end: 0.0 for (_start, end) in shift_windows}
        for t, v in events:
            for (start, end) in shift_windows:
                if start <= t <= end:
                    sums[end] += v
                    break
        return [[end.isoformat(), float(sums[end])] for (_start, end) in shift_windows]

    def fetch_raw_cash_rows() -> List[tuple]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT cf.time, cf.type, cf.amount
                FROM cash_flow cf
                LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
                  AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
                  AND (%s IS NULL OR cf.party_id = %s)
                """,
                (store_id, start_dt, end_dt_next, party_id, party_id),
            )
            return [
                (r["time"], r["type"], float(r["amount"] or 0))
                for r in cur.fetchall()
            ]

    # Build response
    shift_windows = fetch_shift_windows() if by_shift else None

    metrics = fetch_card_metrics()
    total_profit_fifo, daily_profit_series, top_products = (
        compute_fifo_once_and_aggregate(shift_windows)
    )
    clients = fetch_clients_analytics()
    payment_method_breakdown = fetch_payment_method_breakdown()
    inventory_net_value_3m = compute_inventory_net_value_trend(by_shift=False)
    inventory_net_value_by_shift = compute_inventory_net_value_trend(by_shift=True)

    if by_shift:
        raw_cash = fetch_raw_cash_rows()
        cash_in_events = [(t, amt) for (t, typ, amt) in raw_cash if typ == "in"]
        cash_out_events = [(t, -amt) for (t, typ, amt) in raw_cash if typ == "out"]
        cash_in_buckets = bucket_by_shift(cash_in_events, shift_windows)
        cash_out_buckets = bucket_by_shift(cash_out_events, shift_windows)
        cash_in_series = cash_in_buckets
        cash_flow_daily = [
            [cash_in_buckets[i][0], cash_in_buckets[i][1], cash_out_buckets[i][1]]
            for i in range(len(cash_in_buckets))
        ]
    else:
        cash_flow_daily = fetch_cashflow_in_vs_out()
        cash_in_series = fetch_cash_in_series_only()

    response = {
        "period": {"start_date": start_date, "end_date": end_date},
        "cards": {
            "total_sales": metrics["total_sales"],
            "purchases": metrics["purchases"],
            "operating_expenses": metrics["operating_expenses"],
            "free_cash": metrics["free_cash"],
            "total_profit_fifo": total_profit_fifo,
            "net_profit": total_profit_fifo
            - metrics["operating_expenses"]
            + metrics["free_cash"],
            "bnpl_outstanding": metrics["bnpl_outstanding"],
            "bnpl_expected_profit": metrics["bnpl_expected_profit"],
            "installment_principal": metrics["installment_principal"],
            "installment_collected": metrics["installment_collected"],
            "installment_remaining": metrics["installment_remaining"],
            "installment_expected_profit": metrics["installment_expected_profit"],
            "interstore_net": metrics["interstore_net"],
            "owner_in": metrics["owner_in"],
            "owner_out": metrics["owner_out"],
            "owner_net": metrics["owner_net"],
        },
        "overview": {
            "cash_in_series": cash_in_series,
            "profit_series": daily_profit_series,
        },
        "top_products": top_products,
        "clients": clients,
        "payment_method_breakdown": payment_method_breakdown,
        "cash_flow_daily": cash_flow_daily,
        "inventory_net_value_3m": inventory_net_value_3m,
        "inventory_net_value_by_shift": inventory_net_value_by_shift,
    }

    return JSONResponse(content=response)
