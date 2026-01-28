"""
Expiration Scheduler - Background task for checking product expiration dates.
Runs daily to create/update notifications for products nearing expiration.
"""

import asyncio
import logging
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv

from notifications import upsert_expiration_notification, remove_expiration_notification

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Default values
DEFAULT_EXPIRATION_ALERT_DAYS = 14
DEFAULT_CHECK_HOUR = 15  # 3 PM
DEFAULT_CHECK_MINUTE = 0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_global_scheduler_settings() -> dict:
    """
    Get the scheduler settings from store_id=1 (primary store) or use defaults.
    Returns dict with 'check_hour' and 'check_minute'.
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get settings from primary store (id=1) - scheduler settings are global
        cur.execute("SELECT extra_info FROM store_data WHERE id = 1")
        result = cur.fetchone()

        cur.close()
        conn.close()

        if result and result.get("extra_info"):
            extra_info = result["extra_info"]
            check_time = extra_info.get(
                "expiration_check_time",
                f"{DEFAULT_CHECK_HOUR:02d}:{DEFAULT_CHECK_MINUTE:02d}",
            )
            parts = check_time.split(":")
            return {
                "check_hour": int(parts[0]) if len(parts) >= 1 else DEFAULT_CHECK_HOUR,
                "check_minute": int(parts[1])
                if len(parts) >= 2
                else DEFAULT_CHECK_MINUTE,
            }

        return {"check_hour": DEFAULT_CHECK_HOUR, "check_minute": DEFAULT_CHECK_MINUTE}

    except Exception as e:
        logging.error(f"Error getting scheduler settings: {e}")
        return {"check_hour": DEFAULT_CHECK_HOUR, "check_minute": DEFAULT_CHECK_MINUTE}


def get_store_scheduler_settings(store_id: int) -> dict:
    """
    Get the scheduler settings for a specific store.
    Returns dict with 'check_hour', 'check_minute', and 'alert_days'.
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
        result = cur.fetchone()

        cur.close()
        conn.close()

        check_hour = DEFAULT_CHECK_HOUR
        check_minute = DEFAULT_CHECK_MINUTE
        alert_days = DEFAULT_EXPIRATION_ALERT_DAYS

        if result and result.get("extra_info"):
            extra_info = result["extra_info"]
            alert_days = extra_info.get(
                "expiration_alert_days", DEFAULT_EXPIRATION_ALERT_DAYS
            )
            check_time = extra_info.get(
                "expiration_check_time",
                f"{DEFAULT_CHECK_HOUR:02d}:{DEFAULT_CHECK_MINUTE:02d}",
            )
            parts = check_time.split(":")
            check_hour = int(parts[0]) if len(parts) >= 1 else DEFAULT_CHECK_HOUR
            check_minute = int(parts[1]) if len(parts) >= 2 else DEFAULT_CHECK_MINUTE

        return {
            "check_hour": check_hour,
            "check_minute": check_minute,
            "alert_days": alert_days,
        }

    except Exception as e:
        logging.error(f"Error getting store {store_id} scheduler settings: {e}")
        return {
            "check_hour": DEFAULT_CHECK_HOUR,
            "check_minute": DEFAULT_CHECK_MINUTE,
            "alert_days": DEFAULT_EXPIRATION_ALERT_DAYS,
        }


def get_store_expiration_threshold(store_id: int) -> int:
    """
    Get the expiration alert threshold for a store from extra_info.
    Falls back to DEFAULT_EXPIRATION_ALERT_DAYS if not set.

    Args:
        store_id: The store ID

    Returns:
        Number of days for expiration alert threshold
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            """
            SELECT extra_info FROM store_data WHERE id = %s
            """,
            (store_id,),
        )
        result = cur.fetchone()

        cur.close()
        conn.close()

        if result and result.get("extra_info"):
            extra_info = result["extra_info"]
            return extra_info.get(
                "expiration_alert_days", DEFAULT_EXPIRATION_ALERT_DAYS
            )

        return DEFAULT_EXPIRATION_ALERT_DAYS

    except Exception as e:
        logging.error(f"Error getting store expiration threshold: {e}")
        return DEFAULT_EXPIRATION_ALERT_DAYS


def check_expiring_products_for_store(store_id: int, threshold_days: int):
    """
    Check a specific store for products with expiring batches and create/update notifications.
    """
    logging.info(
        f"Starting expiration check for store {store_id} with threshold {threshold_days} days..."
    )

    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        threshold_date = datetime.now().date() + timedelta(days=threshold_days)

        # Get products with expiring batches
        cur.execute(
            """
            SELECT 
                pb.product_id,
                p.name as product_name,
                json_agg(
                    json_build_object(
                        'quantity', pb.quantity,
                        'expiration_date', pb.expiration_date
                    ) ORDER BY pb.expiration_date ASC
                ) as expiring_batches,
                SUM(pb.quantity) as total_expiring_quantity,
                MIN(pb.expiration_date) as earliest_expiration
            FROM product_batches pb
            JOIN products p ON pb.product_id = p.id
            WHERE pb.store_id = %s 
            AND pb.quantity > 0
            AND pb.expiration_date IS NOT NULL
            AND pb.expiration_date <= %s
            GROUP BY pb.product_id, p.name
            """,
            (store_id, threshold_date),
        )
        expiring_products = cur.fetchall()

        # Get products that previously had expiration notifications
        cur.execute(
            """
            SELECT reference_id as product_id
            FROM notifications
            WHERE store_id = %s AND type = 'expiration' AND deleted_at IS NULL
            """,
            (store_id,),
        )
        existing_notif_products = {row["product_id"] for row in cur.fetchall()}

        # Track which products we've processed
        processed_products = set()

        # Create/update notifications for expiring products
        for product in expiring_products:
            product_id = product["product_id"]
            product_name = product["product_name"]
            expiring_batches = product["expiring_batches"]
            total_qty = product["total_expiring_quantity"]
            earliest_exp = product["earliest_expiration"]

            processed_products.add(product_id)

            # Calculate days until earliest expiration
            days_until = (earliest_exp - datetime.now().date()).days

            # Format batch data for notification
            batch_info = [
                {
                    "quantity": b["quantity"],
                    "expiration_date": str(b["expiration_date"]),
                }
                for b in expiring_batches
            ]

            upsert_expiration_notification(
                store_id=store_id,
                product_id=product_id,
                product_name=product_name,
                expiring_batches=batch_info,
                total_expiring_quantity=total_qty,
                days_until_expiration=days_until,
            )

            logging.info(
                f"Updated expiration notification for product {product_id} in store {store_id}"
            )

        # Remove notifications for products no longer expiring
        products_to_remove = existing_notif_products - processed_products
        for product_id in products_to_remove:
            remove_expiration_notification(store_id, product_id)
            logging.info(
                f"Removed expiration notification for product {product_id} in store {store_id}"
            )

        cur.close()
        conn.close()

        logging.info(f"Expiration check completed for store {store_id}")

    except Exception as e:
        logging.error(f"Error in expiration check for store {store_id}: {e}")
        if conn:
            conn.close()


def check_expiring_products():
    """
    Check all stores for products with expiring batches and create/update notifications.
    Legacy function - runs check for all stores at once.
    """
    logging.info("Starting expiration check for all stores...")

    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get all stores
        cur.execute("SELECT id FROM store_data")
        stores = cur.fetchall()
        cur.close()
        conn.close()

        for store in stores:
            store_id = store["id"]
            threshold_days = get_store_expiration_threshold(store_id)
            check_expiring_products_for_store(store_id, threshold_days)

        logging.info("Expiration check completed for all stores")

    except Exception as e:
        logging.error(f"Error in expiration check: {e}")


async def store_expiration_scheduler_loop(store_id: int):
    """
    Async loop that runs expiration check for a specific store at its configured time.
    Runs immediately on startup, then at the configured time daily.
    Checks settings every minute to pick up changes without restart.
    """
    logging.info(f"Starting expiration scheduler for store {store_id}...")

    # Run immediately on startup
    settings = get_store_scheduler_settings(store_id)
    check_expiring_products_for_store(store_id, settings["alert_days"])

    # Track the last scheduled run (date + time) to avoid running multiple times
    # Use None initially so we can run at the scheduled time even on the first day
    last_scheduled_run = None
    last_logged_schedule = None

    while True:
        try:
            # Get current scheduler settings for this store (check every iteration)
            settings = get_store_scheduler_settings(store_id)
            check_hour = settings["check_hour"]
            check_minute = settings["check_minute"]
            alert_days = settings["alert_days"]

            now = datetime.now()
            current_time = (now.hour, now.minute)
            scheduled_time = (check_hour, check_minute)

            # Log next scheduled time only when it changes
            next_run = now.replace(
                hour=check_hour, minute=check_minute, second=0, microsecond=0
            )
            if next_run <= now:
                next_run += timedelta(days=1)

            schedule_key = f"{store_id}-{check_hour}:{check_minute}"
            if last_logged_schedule != schedule_key:
                sleep_seconds = (next_run - now).total_seconds()
                logging.info(
                    f"Store {store_id}: Next expiration check at {next_run.strftime('%Y-%m-%d %H:%M')} (in {sleep_seconds / 3600:.1f} hours)"
                )
                last_logged_schedule = schedule_key

            # Create a unique key for this scheduled run (date + scheduled time)
            current_scheduled_key = (now.date(), check_hour, check_minute)

            # Check if it's time to run (current time matches scheduled time and we haven't run this schedule yet)
            if (
                current_time == scheduled_time
                and last_scheduled_run != current_scheduled_key
            ):
                logging.info(f"Store {store_id}: Running scheduled expiration check...")
                check_expiring_products_for_store(store_id, alert_days)
                last_scheduled_run = current_scheduled_key
                last_logged_schedule = None  # Force re-log of next schedule

            # Sleep for 60 seconds before checking again
            await asyncio.sleep(60)

        except asyncio.CancelledError:
            logging.info(f"Expiration scheduler for store {store_id} cancelled")
            break
        except Exception as e:
            logging.error(
                f"Error in expiration scheduler loop for store {store_id}: {e}"
            )
            # On error, wait a minute and try again
            await asyncio.sleep(60)


async def expiration_scheduler_loop():
    """
    Async loop that runs expiration check daily at configured time.
    Runs immediately on startup, then at the configured time daily.
    Legacy function - kept for backwards compatibility.
    """
    logging.info("Starting expiration scheduler...")

    # Run immediately on startup
    check_expiring_products()

    while True:
        try:
            # Get current scheduler settings
            settings = get_global_scheduler_settings()
            check_hour = settings["check_hour"]
            check_minute = settings["check_minute"]

            # Calculate time until next run
            now = datetime.now()
            next_run = now.replace(
                hour=check_hour, minute=check_minute, second=0, microsecond=0
            )
            if next_run <= now:
                next_run += timedelta(days=1)

            sleep_seconds = (next_run - now).total_seconds()
            logging.info(
                f"Next expiration check scheduled at {next_run.strftime('%Y-%m-%d %H:%M')} (in {sleep_seconds / 3600:.1f} hours)"
            )

            # Sleep until next scheduled run
            await asyncio.sleep(sleep_seconds)

            # Run the check
            check_expiring_products()

        except asyncio.CancelledError:
            logging.info("Expiration scheduler cancelled")
            break
        except Exception as e:
            logging.error(f"Error in expiration scheduler loop: {e}")
            # On error, retry in 1 hour
            await asyncio.sleep(3600)


def start_expiration_scheduler():
    """
    Start the expiration scheduler as background tasks - one per store.
    Should be called from FastAPI startup event.
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get all stores
        cur.execute("SELECT id FROM store_data")
        stores = cur.fetchall()

        cur.close()
        conn.close()

        # Create a separate scheduler task for each store
        for store in stores:
            store_id = store["id"]
            asyncio.create_task(store_expiration_scheduler_loop(store_id))
            logging.info(
                f"Expiration scheduler background task created for store {store_id}"
            )

    except Exception as e:
        logging.error(f"Error starting expiration schedulers: {e}")
        # Fallback to single global scheduler
        asyncio.create_task(expiration_scheduler_loop())
        logging.info("Fallback: Single expiration scheduler background task created")
