"""
Notifications API endpoints for in-app notifications.
Handles CRUD operations for notifications including expiration alerts.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv

from auth_middleware import get_current_user

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

router = APIRouter(tags=["Notifications"])


class NotificationCreate(BaseModel):
    """Model for creating a notification"""

    title: str
    content: Optional[str] = None
    type: str = "general"
    reference_id: Optional[int] = None


class NotificationUpdate(BaseModel):
    """Model for updating a notification"""

    title: Optional[str] = None
    content: Optional[str] = None


class Database:
    """Database context manager to handle the connection and cursor"""

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        self.cursor = self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )

    def __enter__(self):
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()


@router.get("/notifications")
def get_notifications(
    store_id: int,
    include_read: bool = True,
    limit: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get all notifications for a store that are not deleted.

    Args:
        store_id: The store ID to get notifications for
        include_read: Whether to include read notifications (default: True)
        limit: Optional limit on number of notifications to return

    Returns:
        Dict containing notifications list and unread count
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Build query based on filters
            read_filter = "" if include_read else "AND is_read = FALSE"
            limit_clause = f"LIMIT {limit}" if limit else ""

            cur.execute(
                f"""
                SELECT 
                    id,
                    store_id,
                    title,
                    content,
                    type,
                    reference_id,
                    is_read,
                    read_at,
                    created_at,
                    updated_at
                FROM notifications
                WHERE store_id = %s
                AND deleted_at IS NULL
                {read_filter}
                ORDER BY created_at DESC
                {limit_clause}
                """,
                (store_id,),
            )
            notifications = cur.fetchall()

            # Convert datetime objects to ISO format strings
            for notif in notifications:
                if notif.get("read_at"):
                    notif["read_at"] = notif["read_at"].isoformat()
                if notif.get("created_at"):
                    notif["created_at"] = notif["created_at"].isoformat()
                if notif.get("updated_at"):
                    notif["updated_at"] = notif["updated_at"].isoformat()

            # Get unread count
            cur.execute(
                """
                SELECT COUNT(*) as unread_count
                FROM notifications
                WHERE store_id = %s
                AND deleted_at IS NULL
                AND is_read = FALSE
                """,
                (store_id,),
            )
            unread_result = cur.fetchone()
            unread_count = unread_result["unread_count"] if unread_result else 0

            return JSONResponse(
                content={"notifications": notifications, "unread_count": unread_count}
            )

    except Exception as e:
        print(f"Error getting notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/notifications/unread-count")
def get_unread_count(
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Get only the unread notifications count for a store.
    Lightweight endpoint for polling.

    Args:
        store_id: The store ID to get unread count for

    Returns:
        Dict containing only the unread count
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT COUNT(*) as unread_count
                FROM notifications
                WHERE store_id = %s
                AND deleted_at IS NULL
                AND is_read = FALSE
                """,
                (store_id,),
            )
            result = cur.fetchone()
            unread_count = result["unread_count"] if result else 0

            return {"unread_count": unread_count}

    except Exception as e:
        print(f"Error getting unread count: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/notifications")
def create_notification(
    notification: NotificationCreate,
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new notification.

    Args:
        notification: The notification data
        store_id: The store ID to create notification for

    Returns:
        The created notification
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO notifications (store_id, title, content, type, reference_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    store_id,
                    notification.title,
                    notification.content,
                    notification.type,
                    notification.reference_id,
                ),
            )
            result = cur.fetchone()

            return JSONResponse(content={"notification": result})

    except Exception as e:
        print(f"Error creating notification: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/notifications/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int,
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Mark a notification as read.

    Args:
        notification_id: The notification ID to mark as read
        store_id: The store ID (for verification)

    Returns:
        Success message
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET is_read = TRUE, read_at = NOW()
                WHERE id = %s AND store_id = %s AND deleted_at IS NULL
                RETURNING id
                """,
                (notification_id, store_id),
            )
            result = cur.fetchone()

            if not result:
                raise HTTPException(status_code=404, detail="Notification not found")

            return {"message": "Notification marked as read"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/notifications/{notification_id}/unread")
def mark_notification_as_unread(
    notification_id: int,
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Mark a notification as unread.

    Args:
        notification_id: The notification ID to mark as unread
        store_id: The store ID (for verification)

    Returns:
        Success message
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET is_read = FALSE, read_at = NULL
                WHERE id = %s AND store_id = %s AND deleted_at IS NULL
                RETURNING id
                """,
                (notification_id, store_id),
            )
            result = cur.fetchone()

            if not result:
                raise HTTPException(status_code=404, detail="Notification not found")

            return {"message": "Notification marked as unread"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error marking notification as unread: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/notifications/read-all")
def mark_all_notifications_as_read(
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Mark all notifications as read for a store.

    Args:
        store_id: The store ID

    Returns:
        Success message with count of updated notifications
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET is_read = TRUE, read_at = NOW()
                WHERE store_id = %s 
                AND deleted_at IS NULL 
                AND is_read = FALSE
                """,
                (store_id,),
            )
            updated_count = cur.rowcount

            return {"message": f"{updated_count} notifications marked as read"}

    except Exception as e:
        print(f"Error marking all notifications as read: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: int,
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Soft delete a notification (sets deleted_at timestamp).

    Args:
        notification_id: The notification ID to delete
        store_id: The store ID (for verification)

    Returns:
        Success message
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE notifications
                SET deleted_at = NOW()
                WHERE id = %s AND store_id = %s AND deleted_at IS NULL
                RETURNING id
                """,
                (notification_id, store_id),
            )
            result = cur.fetchone()

            if not result:
                raise HTTPException(status_code=404, detail="Notification not found")

            return {"message": "Notification deleted"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting notification: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ===== Helper functions for expiration notifications =====


def upsert_expiration_notification(
    store_id: int,
    product_id: int,
    product_name: str,
    expiring_batches: list,
    total_expiring_quantity: int,
    days_until_expiration: int,
):
    """
    Create or update an expiration notification for a product.
    If the notification exists and content changed, reset is_read and deleted_at.

    Args:
        store_id: The store ID
        product_id: The product ID (used as reference_id)
        product_name: The product name for display
        expiring_batches: List of batch info dicts with quantity and expiration_date
        total_expiring_quantity: Total quantity expiring
        days_until_expiration: Minimum days until expiration
    """
    # Format the notification content
    if days_until_expiration <= 0:
        title = f"⚠️ منتج منتهي الصلاحية: {product_name}"
        urgency = "منتهية الصلاحية"
    elif days_until_expiration <= 7:
        title = f"🔴 صلاحية قريبة جداً: {product_name}"
        urgency = f"خلال {days_until_expiration} أيام"
    else:
        title = f"🟡 تنبيه صلاحية: {product_name}"
        urgency = f"خلال {days_until_expiration} يوم"

    # Build content with batch details
    batch_details = []
    for batch in expiring_batches:
        exp_date = batch["expiration_date"]
        qty = batch["quantity"]
        batch_details.append(f"• {qty} وحدة - تنتهي في {exp_date}")

    content = f"""إجمالي الكمية: {total_expiring_quantity} وحدة ({urgency})

تفاصيل الدفعات:
{chr(10).join(batch_details)}"""

    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Check if notification exists
        cur.execute(
            """
            SELECT id, content FROM notifications
            WHERE store_id = %s AND type = 'expiration' AND reference_id = %s
            """,
            (store_id, product_id),
        )
        existing = cur.fetchone()

        if existing:
            # Update existing notification
            # Reset is_read and deleted_at if content changed
            if existing["content"] != content:
                cur.execute(
                    """
                    UPDATE notifications
                    SET title = %s, content = %s, is_read = FALSE, 
                        read_at = NULL, deleted_at = NULL, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (title, content, existing["id"]),
                )
        else:
            # Create new notification
            cur.execute(
                """
                INSERT INTO notifications (store_id, title, content, type, reference_id)
                VALUES (%s, %s, %s, 'expiration', %s)
                """,
                (store_id, title, content, product_id),
            )

        conn.commit()
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Error upserting expiration notification: {e}")
        if conn:
            conn.rollback()
            conn.close()


def remove_expiration_notification(store_id: int, product_id: int):
    """
    Remove (soft delete) an expiration notification when product is no longer expiring.

    Args:
        store_id: The store ID
        product_id: The product ID (reference_id)
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor()

        cur.execute(
            """
            UPDATE notifications
            SET deleted_at = NOW()
            WHERE store_id = %s AND type = 'expiration' AND reference_id = %s
            AND deleted_at IS NULL
            """,
            (store_id, product_id),
        )

        conn.commit()
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Error removing expiration notification: {e}")
        if conn:
            conn.rollback()
            conn.close()
