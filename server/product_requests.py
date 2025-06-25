from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv

from auth import get_current_user
from whatsapp_utils import (
    send_whatsapp_notification_background,
    format_product_request_message,
)

# Load environment variables
load_dotenv()
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


# Define the Database class
class Database:
    "Database context manager to handle the connection and cursor"

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor

    def __enter__(self):
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        self.cursor = self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()


# Define the router
router = APIRouter()


# Pydantic Models
class ProductRequestItem(BaseModel):
    product_id: int
    requested_quantity: int


class ProductRequest(BaseModel):
    requested_store_id: int
    items: List[ProductRequestItem]


class UpdateProductRequest(BaseModel):
    status: str


class UpdateProductRequestItem(BaseModel):
    status: str


@router.post("/product-requests", tags=["Product Requests"])
def create_product_request(
    request: ProductRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Create the product request
            cur.execute(
                "INSERT INTO product_requests (requesting_store_id, requested_store_id) VALUES (%s, %s) RETURNING id, created_at",
                (user["store_id"], request.requested_store_id),
            )
            request_result = cur.fetchone()
            if not request_result:
                raise HTTPException(
                    status_code=500, detail="Failed to create product request"
                )
            request_id = request_result["id"]
            created_at = request_result["created_at"]

            # Create the product request items
            product_details = []
            for item in request.items:
                cur.execute(
                    "INSERT INTO product_request_items (product_request_id, product_id, requested_quantity) VALUES (%s, %s, %s)",
                    (request_id, item.product_id, item.requested_quantity),
                )
                cur.execute(
                    "SELECT name FROM products WHERE id = %s", (item.product_id,)
                )
                product_name = cur.fetchone()["name"]
                product_details.append(
                    {"name": product_name, "quantity": item.requested_quantity}
                )

            # Get store names for notification
            cur.execute(
                "SELECT name FROM store_data WHERE id = %s", (user["store_id"],)
            )
            requesting_store_name = cur.fetchone()["name"]
            cur.execute(
                "SELECT name FROM store_data WHERE id = %s",
                (request.requested_store_id,),
            )
            requested_store_name = cur.fetchone()["name"]

            # Send WhatsApp notification as a background task
            message = format_product_request_message(
                requesting_store_name=requesting_store_name,
                requested_store_name=requested_store_name,
                products=product_details,
                request_time=created_at.strftime("%Y-%m-%d %H:%M"),
                user_name=user["username"],
            )
            background_tasks.add_task(
                send_whatsapp_notification_background,
                request.requested_store_id,
                message,
            )

        return {"message": "Product request created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/product-requests", tags=["Product Requests"])
def get_product_requests(store_id: int, user: dict = Depends(get_current_user)):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT pr.id, pr.requesting_store_id, pr.requested_store_id, pr.status, pr.created_at, pr.updated_at,
                       s1.name as requesting_store_name, s2.name as requested_store_name
                FROM product_requests pr
                JOIN store_data s1 ON pr.requesting_store_id = s1.id
                JOIN store_data s2 ON pr.requested_store_id = s2.id
                WHERE pr.requesting_store_id = %s OR pr.requested_store_id = %s
                ORDER BY pr.created_at DESC
                """,
                (store_id, store_id),
            )
            requests = cur.fetchall()

            for req in requests:
                cur.execute(
                    """
                    SELECT pri.id, pri.product_id, pri.requested_quantity, pri.status, pri.notes, p.name as product_name
                    FROM product_request_items pri
                    JOIN products p ON pri.product_id = p.id
                    WHERE pri.product_request_id = %s
                    """,
                    (req["id"],),
                )
                req["items"] = cur.fetchall()

            return requests
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/product-requests/{request_id}", tags=["Product Requests"])
def update_product_request(
    request_id: int,
    request_update: UpdateProductRequest,
    user: dict = Depends(get_current_user),
):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                "UPDATE product_requests SET status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (request_update.status, request_id),
            )
        return {"message": "Product request updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/product-requests/{request_id}/items/{item_id}", tags=["Product Requests"])
def update_product_request_item(
    request_id: int,
    item_id: int,
    item_update: UpdateProductRequestItem,
    user: dict = Depends(get_current_user),
):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                "UPDATE product_request_items SET status = %s WHERE id = %s AND product_request_id = %s",
                (item_update.status, item_id, request_id),
            )
        return {"message": "Product request item updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
