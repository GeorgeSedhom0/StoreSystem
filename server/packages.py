"""
Product packages (v26): a named multiple of a product's base unit with its own
price and optional barcode (e.g. a carton of 10 packs).

Stock stays in base units. A bill line sold/bought as a package keeps
amount/price in base units plus a snapshot (package_id, package_units,
package_name) on products_flow, so nothing that sums stock or money changes.

Barcodes are one namespace: a package barcode can't equal any product barcode
or another active package's barcode (checked both ways).
"""

from os import getenv
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from analytics_utils import Database
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()

MAX_UNITS = 100000


class PackageIn(BaseModel):
    id: Optional[int] = None
    name: str
    units: int
    price: float
    bar_code: Optional[str] = None


class PackagesIn(BaseModel):
    packages: List[PackageIn]


# SQL fragment: active packages per product as a JSON array (smallest first).
PACKAGES_JSON_SUBQUERY = """
    SELECT product_id,
           json_agg(
               json_build_object(
                   'id', id, 'name', name, 'units', units,
                   'price', price, 'bar_code', bar_code
               ) ORDER BY units, id
           ) AS packages
    FROM product_packages
    WHERE is_deleted = FALSE
    GROUP BY product_id
"""


def barcode_owner(
    cur,
    code: Optional[str],
    exclude_product_id: Optional[int] = None,
    exclude_package_ids: Optional[List[int]] = None,
) -> Optional[str]:
    """Name of whatever already uses this barcode (a product or a package),
    or None if it is free."""
    code = (code or "").strip()
    if not code:
        return None
    cur.execute(
        "SELECT name FROM products WHERE bar_code = %s AND id IS DISTINCT FROM %s LIMIT 1",
        (code, exclude_product_id),
    )
    r = cur.fetchone()
    if r:
        return r["name"]
    cur.execute(
        """
        SELECT p.name || ' — ' || pk.name AS name
        FROM product_packages pk
        JOIN products p ON p.id = pk.product_id
        WHERE pk.bar_code = %s AND pk.is_deleted = FALSE
          AND NOT (pk.id = ANY(%s))
        LIMIT 1
        """,
        (code, list(exclude_package_ids or [])),
    )
    r = cur.fetchone()
    return r["name"] if r else None


def _list(cur, product_id: int) -> list:
    cur.execute(
        """
        SELECT id, name, units, price, bar_code
        FROM product_packages
        WHERE product_id = %s AND is_deleted = FALSE
        ORDER BY units, id
        """,
        (product_id,),
    )
    return [dict(r) for r in cur.fetchall()]


@router.get("/products/{product_id}/packages")
def get_packages(product_id: int, current_user: dict = Depends(get_current_user)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        return _list(cur, product_id)


@router.put("/products/{product_id}/packages")
def set_packages(
    product_id: int,
    body: PackagesIn,
    current_user: dict = Depends(get_current_user),
):
    """Replace the product's active packages with the given list: rows with an
    id are updated, rows without are added, missing ones are soft-deleted (old
    bills keep their snapshot)."""
    pkgs = body.packages
    seen_names, seen_codes, seen_units = set(), set(), set()
    for p in pkgs:
        p.name = (p.name or "").strip()
        p.bar_code = (p.bar_code or "").strip() or None
        if not p.name:
            raise HTTPException(status_code=400, detail="اسم العبوة مطلوب")
        if p.units < 2 or p.units > MAX_UNITS:
            raise HTTPException(
                status_code=400,
                detail=f"عدد الوحدات في «{p.name}» يجب أن يكون 2 أو أكثر",
            )
        if p.price < 0:
            raise HTTPException(status_code=400, detail="سعر العبوة لا يمكن أن يكون سالباً")
        if p.name in seen_names:
            raise HTTPException(status_code=400, detail=f"اسم العبوة «{p.name}» مكرر")
        if p.units in seen_units:
            raise HTTPException(
                status_code=400,
                detail=f"توجد عبوتان بنفس عدد الوحدات ({p.units})",
            )
        if p.bar_code and p.bar_code in seen_codes:
            raise HTTPException(status_code=400, detail=f"الباركود {p.bar_code} مكرر")
        seen_names.add(p.name)
        seen_units.add(p.units)
        if p.bar_code:
            seen_codes.add(p.bar_code)

    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute("SELECT id, bar_code FROM products WHERE id = %s FOR UPDATE", (product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="المنتج غير موجود")

        existing = {r["id"]: r for r in _list(cur, product_id)}
        keep_ids = [p.id for p in pkgs if p.id in existing]

        for p in pkgs:
            if not p.bar_code:
                continue
            if p.bar_code == (product["bar_code"] or ""):
                raise HTTPException(
                    status_code=400,
                    detail="باركود العبوة لا يمكن أن يكون نفس باركود المنتج",
                )
            owner = barcode_owner(cur, p.bar_code, exclude_package_ids=keep_ids)
            if owner:
                raise HTTPException(
                    status_code=400,
                    detail=f"الباركود {p.bar_code} مستخدم بالفعل لـ «{owner}»",
                )

        # Free the kept rows' barcodes first so two packages can swap codes
        # without tripping the unique index halfway through.
        if keep_ids:
            cur.execute(
                "UPDATE product_packages SET bar_code = NULL WHERE id = ANY(%s)",
                (keep_ids,),
            )
        removed = [pid for pid in existing if pid not in keep_ids]
        if removed:
            cur.execute(
                "UPDATE product_packages SET is_deleted = TRUE WHERE id = ANY(%s)",
                (removed,),
            )
        for p in pkgs:
            if p.id in existing:
                cur.execute(
                    """
                    UPDATE product_packages
                    SET name = %s, units = %s, price = %s, bar_code = %s
                    WHERE id = %s AND product_id = %s
                    """,
                    (p.name, p.units, p.price, p.bar_code, p.id, product_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO product_packages (product_id, name, units, price, bar_code)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (product_id, p.name, p.units, p.price, p.bar_code),
                )
        return _list(cur, product_id)


def package_snapshot(cur, product_id: int, package_id, package_units, package_name, quantity: int):
    """Validate a bill line sold as a package and return the snapshot
    (package_id, package_units, package_name), or (None, None, None) for a
    plain unit line. quantity is in base units."""
    if not package_units:
        return None, None, None
    units = int(package_units)
    if units < 2:
        return None, None, None
    if quantity % units != 0:
        raise HTTPException(
            status_code=400,
            detail="كمية العبوة يجب أن تكون عدداً صحيحاً من العبوات",
        )
    name = (package_name or "").strip() or None
    pid = package_id
    if package_id:
        cur.execute(
            "SELECT name FROM product_packages WHERE id = %s AND product_id = %s",
            (package_id, product_id),
        )
        r = cur.fetchone()
        if r:
            name = name or r["name"]
        else:
            pid = None
    return pid, units, name or "عبوة"
