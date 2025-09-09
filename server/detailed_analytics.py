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

    # Cards: bills aggregates
    def fetch_bills_aggregates() -> Dict:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE b.type IN ('sell','return')) AS bills_count,
                    COALESCE(SUM(b.total) FILTER (WHERE b.type IN ('sell','return')), 0) AS total_sales,
                    COALESCE(AVG(b.discount) FILTER (WHERE b.type IN ('sell','return')), 0) AS avg_discount
                FROM bills b
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE b.store_id = %s
                  AND b.time >= %s AND b.time < %s
                  AND (b.party_id IS NULL OR ap.type != 'store')
                """,
                (store_id, start_dt, end_dt_next),
            )
            row = cur.fetchone() or {
                "bills_count": 0,
                "total_sales": 0,
                "avg_discount": 0,
            }
            bills_count = int(row["bills_count"] or 0)
            total_sales = float(row["total_sales"] or 0)
            avg_bill_total = total_sales / bills_count if bills_count > 0 else 0.0
            return {
                "bills_count": bills_count,
                "total_sales": total_sales,
                "avg_bill_total": avg_bill_total,
                "avg_discount": float(row["avg_discount"] or 0),
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
                """,
                (store_id, start_dt, end_dt_next),
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

            if btype == "buy" and amount > 0:
                inv.append((w_cost, amount))
                last_known_cost = w_cost or last_known_cost
                continue

            if btype == "sell" and amount < 0:
                sell_qty = -amount
                if include_for_profit:
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

        avg_cost_per_unit = (
            (accumulated_cost_for_sold / total_units_sold)
            if total_units_sold > 0
            else 0.0
        )
        return {
            "product_id": product_id,
            "daily_profit": daily_profit,
            "total_profit": total_profit,
            "total_sales_value": total_sales_value,
            "total_units_sold": total_units_sold,
            "avg_cost_per_unit": avg_cost_per_unit,
        }

    def compute_fifo_once_and_aggregate():
        product_ids = get_products_sold_in_period()
        meta = get_product_meta(product_ids)

        overall_daily_profit: Dict[str, float] = {}
        per_product: Dict[int, Dict] = {}
        total_profit_fifo = 0.0

        for pid in product_ids:
            stats = compute_fifo_profit_for_product(pid)
            per_product[pid] = stats
            total_profit_fifo += stats["total_profit"]
            for d, p in stats["daily_profit"].items():
                overall_daily_profit[d] = overall_daily_profit.get(d, 0.0) + p

        all_dates = pd.date_range(start=start_dt.date(), end=end_dt.date(), freq="D")
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
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT b.party_id,
                       COALESCE(SUM(b.total), 0) AS period_total,
                       COALESCE((
                           SELECT COUNT(*) FROM bills b2
                           WHERE b2.store_id = b.store_id
                             AND b2.party_id = b.party_id
                             AND b2.type = 'sell'
                             AND b2.time < %s
                       ), 0) AS prior_count
                FROM bills b
                LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
                WHERE b.store_id = %s
                  AND b.type = 'sell'
                  AND b.time >= %s AND b.time < %s
                  AND b.party_id IS NOT NULL
                  AND (b.party_id IS NULL OR ap.type != 'store')
                GROUP BY b.party_id, b.store_id
                """,
                (start_dt, store_id, start_dt, end_dt_next),
            )
            rows = cur.fetchall()
        categories = {
            "new": {"count": 0, "total_sales": 0.0},
            "returning_lt5": {"count": 0, "total_sales": 0.0},
            "loyal_gte5": {"count": 0, "total_sales": 0.0},
        }
        for r in rows:
            party_id = r["party_id"]
            if party_id is None:
                continue
            total = float(r["period_total"] or 0)
            prior = int(r["prior_count"] or 0)
            if prior == 0:
                cat = "new"
            elif prior < 5:
                cat = "returning_lt5"
            else:
                cat = "loyal_gte5"
            categories[cat]["count"] += 1
            categories[cat]["total_sales"] += total
        return categories

    def fetch_cashflow_in_vs_out() -> List[List]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                WITH date_series AS (
                    SELECT generate_series(%s::date, %s::date, '1 day'::interval)::date AS day
                ), agg AS (
                    SELECT DATE_TRUNC('day', time)::date AS day,
                           SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END) AS cash_in,
                           SUM(CASE WHEN type = 'out' THEN -amount ELSE 0 END) AS cash_out
                    FROM cash_flow
                    WHERE store_id = %s AND time >= %s AND time < %s
                    GROUP BY DATE_TRUNC('day', time)::date
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
                    SELECT generate_series(%s::date, %s::date, '1 day'::interval)::date AS day
                ), agg AS (
                    SELECT DATE_TRUNC('day', time)::date AS day,
                           SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END) AS cash_in
                    FROM cash_flow
                    WHERE store_id = %s AND time >= %s AND time < %s
                    GROUP BY DATE_TRUNC('day', time)::date
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
                ),
            )
            return [
                [r["day"].strftime("%Y-%m-%d"), float(r["cash_in"] or 0)]
                for r in cur.fetchall()
            ]

    def fetch_non_bill_cash_totals() -> Dict[str, float]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS non_bill_in,
                    COALESCE(SUM(CASE WHEN type = 'out' THEN -amount ELSE 0 END), 0) AS non_bill_out
                FROM cash_flow
                WHERE store_id = %s AND bill_id IS NULL
                  AND time >= %s AND time < %s
                """,
                (store_id, start_dt, end_dt_next),
            )
            row = cur.fetchone() or {"non_bill_in": 0, "non_bill_out": 0}
            return {
                "non_bill_in": float(row["non_bill_in"] or 0),
                "non_bill_out": float(row["non_bill_out"] or 0),
            }

    def compute_inventory_net_value_trend() -> List[List]:
        with Database(HOST, DATABASE, USER, PASS) as cur:
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
            price_basis = {
                int(r["product_id"]): float(r["wholesale_price"] or 0) for r in inv_rows
            }

            cur.execute(
                """
                SELECT pf.product_id, COALESCE(SUM(pf.amount), 0) AS net_after_start
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.store_id = %s AND b.time > %s AND b.id > 0
                GROUP BY pf.product_id
                """,
                (store_id, start_dt),
            )
            after_rows = cur.fetchall()
            net_after_start = {
                int(r["product_id"]): float(r["net_after_start"] or 0)
                for r in after_rows
            }

            cur.execute(
                """
                SELECT pf.product_id, DATE_TRUNC('day', b.time)::date AS day, SUM(pf.amount) AS net_amount
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.store_id = %s AND b.time >= %s AND b.time < %s AND b.id > 0
                GROUP BY pf.product_id, DATE_TRUNC('day', b.time)::date
                ORDER BY pf.product_id, day
                """,
                (store_id, start_dt, end_dt_next),
            )
            flow_rows = cur.fetchall()

        all_pids = set(current_stock.keys()) | set(net_after_start.keys())
        stock_state = {
            pid: current_stock.get(pid, 0.0) - net_after_start.get(pid, 0.0)
            for pid in all_pids
        }

        flows_by_prod_day: Dict[int, Dict[str, float]] = {}
        for r in flow_rows:
            pid = int(r["product_id"])
            d = r["day"].strftime("%Y-%m-%d")
            flows_by_prod_day.setdefault(pid, {})[d] = float(r["net_amount"] or 0)

        days = list(pd.date_range(start=start_dt.date(), end=end_dt.date(), freq="D"))
        series: List[List] = []
        for d in days:
            d_str = d.strftime("%Y-%m-%d")
            for pid in set(stock_state.keys()) | set(flows_by_prod_day.keys()):
                flow = flows_by_prod_day.get(pid, {}).get(d_str, 0.0)
                if abs(flow) > 1e-9:
                    stock_state[pid] = stock_state.get(pid, 0.0) + flow
            total_value = 0.0
            for pid, qty in stock_state.items():
                total_value += qty * price_basis.get(pid, 0.0)
            series.append([d_str, float(total_value)])
        return series

    # Build response
    cards = fetch_bills_aggregates()
    total_profit_fifo, daily_profit_series, top_products = (
        compute_fifo_once_and_aggregate()
    )
    clients = fetch_clients_analytics()
    cash_flow_daily = fetch_cashflow_in_vs_out()
    cash_in_series = fetch_cash_in_series_only()
    non_bill_cash = fetch_non_bill_cash_totals()
    inventory_net_value_3m = compute_inventory_net_value_trend()

    response = {
        "period": {"start_date": start_date, "end_date": end_date},
        "cards": {
            "total_sales": cards["total_sales"],
            "total_profit_fifo": total_profit_fifo,
            "non_bill_cash_in": non_bill_cash["non_bill_in"],
            "non_bill_cash_out": non_bill_cash["non_bill_out"],
            "total_profit_net": total_profit_fifo
            + non_bill_cash["non_bill_in"]
            - non_bill_cash["non_bill_out"],
            "bills_count": cards["bills_count"],
            "avg_bill_total": cards["avg_bill_total"],
            "avg_discount": cards.get("avg_discount", 0.0),
        },
        "overview": {
            "cash_in_series": cash_in_series,
            "profit_series": daily_profit_series,
        },
        "top_products": top_products,
        "clients": clients,
        "cash_flow_daily": cash_flow_daily,
        "inventory_net_value_3m": inventory_net_value_3m,
    }

    return JSONResponse(content=response)
