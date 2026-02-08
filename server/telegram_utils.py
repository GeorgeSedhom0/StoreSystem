from typing import List, Dict, Any
import logging
from os import getenv
import requests
import json
import html
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Telegram Bot API configuration
TELEGRAM_BOT_TOKEN = getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_BASE = "https://api.telegram.org/bot"

# Database connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


def get_store_telegram_chat_id(store_id: int):
    """Get Telegram chat ID for a specific store"""
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
        result = cur.fetchone()

        cur.close()
        conn.close()

        if result and result["extra_info"]:
            extra_info = result["extra_info"]
            return extra_info.get("telegram_chat_id")
        return None
    except Exception as e:
        logger.error(f"Error getting store Telegram chat ID: {e}")
        return None


def save_store_telegram_chat_id(store_id: int, chat_id: str):
    """Save Telegram chat ID for a specific store"""
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
        result = cur.fetchone()

        extra_info = result["extra_info"] if result and result["extra_info"] else {}
        extra_info["telegram_chat_id"] = chat_id

        cur.execute(
            "UPDATE store_data SET extra_info = %s WHERE id = %s",
            (json.dumps(extra_info), store_id),
        )

        conn.commit()
        cur.close()
        conn.close()

        return True
    except Exception as e:
        logger.error(f"Error saving store Telegram chat ID: {e}")
        return False


def call_telegram_api(method: str, data: dict = None, timeout: int = 30) -> dict:
    """Call the Telegram Bot API directly"""
    try:
        if not TELEGRAM_BOT_TOKEN:
            return {"success": False, "message": "Telegram bot token not configured"}

        url = f"{TELEGRAM_API_BASE}{TELEGRAM_BOT_TOKEN}/{method}"
        response = requests.post(url, json=data, timeout=timeout)
        result = response.json()

        if result.get("ok"):
            return {"success": True, "result": result.get("result")}
        else:
            return {
                "success": False,
                "message": result.get("description", "Unknown error"),
            }
    except requests.exceptions.ConnectionError:
        logger.error("Cannot connect to Telegram API")
        return {"success": False, "message": "Cannot connect to Telegram API"}
    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling Telegram API: {method}")
        return {"success": False, "message": "Telegram API request timeout"}
    except Exception as e:
        logger.error(f"Unexpected error calling Telegram API: {e}")
        return {"success": False, "message": str(e)}


def validate_bot_token(token: str = None) -> dict:
    """Validate a Telegram bot token by calling getMe"""
    try:
        use_token = token or TELEGRAM_BOT_TOKEN
        if not use_token:
            return {"success": False, "message": "No bot token provided"}

        url = f"{TELEGRAM_API_BASE}{use_token}/getMe"
        response = requests.get(url, timeout=10)
        result = response.json()

        if result.get("ok"):
            bot_info = result.get("result", {})
            return {
                "success": True,
                "bot_username": bot_info.get("username"),
                "bot_name": bot_info.get("first_name"),
            }
        else:
            return {
                "success": False,
                "message": result.get("description", "Invalid bot token"),
            }
    except Exception as e:
        logger.error(f"Error validating bot token: {e}")
        return {"success": False, "message": str(e)}


def get_telegram_status() -> dict:
    """Get current Telegram bot status by validating the token"""
    if not TELEGRAM_BOT_TOKEN:
        return {"connected": False, "bot_username": None}

    result = validate_bot_token()
    if result.get("success"):
        return {
            "connected": True,
            "bot_username": result.get("bot_username"),
        }
    else:
        return {"connected": False, "bot_username": None}


def get_telegram_updates(token: str = None) -> list:
    """Fetch recent messages sent to the bot to detect chat_ids from /start commands"""
    try:
        use_token = token or TELEGRAM_BOT_TOKEN
        if not use_token:
            return []

        url = f"{TELEGRAM_API_BASE}{use_token}/getUpdates"
        response = requests.get(url, timeout=10)
        result = response.json()

        if not result.get("ok"):
            return []

        updates = result.get("result", [])
        seen_chats = {}

        for update in updates:
            message = update.get("message", {})
            chat = message.get("chat", {})
            chat_id = str(chat.get("id", ""))

            if chat_id and chat_id not in seen_chats:
                seen_chats[chat_id] = {
                    "chat_id": chat_id,
                    "username": chat.get("username"),
                    "first_name": chat.get("first_name", ""),
                    "last_name": chat.get("last_name", ""),
                    "type": chat.get("type", "private"),
                    "title": chat.get("title"),  # For groups
                }

        return list(seen_chats.values())
    except Exception as e:
        logger.error(f"Error getting Telegram updates: {e}")
        return []


def split_message(message: str, max_length: int = 4096) -> list:
    """Split a long message into multiple messages at newline boundaries"""
    if len(message) <= max_length:
        return [message]

    messages = []
    current = ""

    for line in message.split("\n"):
        if len(current) + len(line) + 1 > max_length:
            if current:
                messages.append(current.rstrip("\n"))
            current = line + "\n"
        else:
            current += line + "\n"

    if current.strip():
        messages.append(current.rstrip("\n"))

    return messages


def send_telegram_message(chat_id: str, message: str, parse_mode: str = "HTML") -> dict:
    """Send a message via Telegram Bot API"""
    messages = split_message(message)
    last_result = None

    for msg in messages:
        result = call_telegram_api(
            "sendMessage",
            {
                "chat_id": chat_id,
                "text": msg,
                "parse_mode": parse_mode,
            },
        )
        last_result = result
        if not result.get("success"):
            return result
        if len(messages) > 1:
            time.sleep(0.5)

    return last_result


def send_notification_to_store(store_id: int, message: str) -> bool:
    """Send Telegram notification to a specific store's configured chat"""
    try:
        if not TELEGRAM_BOT_TOKEN:
            logger.warning("Telegram bot token not configured")
            return False

        chat_id = get_store_telegram_chat_id(store_id)
        if not chat_id:
            logger.warning(f"No Telegram chat_id configured for store {store_id}")
            return False

        result = send_telegram_message(chat_id, message)

        if result.get("success"):
            logger.info(f"Notification sent to store {store_id}")
            return True
        else:
            logger.error(
                f"Failed to send notification to store {store_id}: {result.get('message')}"
            )
            return False

    except Exception as e:
        logger.error(f"Error sending notification to store {store_id}: {e}")
        return False


def send_telegram_notification_background(store_id: int, message: str):
    """Background task to send Telegram notification"""
    try:
        success = send_notification_to_store(store_id, message)

        if success:
            logging.info(
                "Telegram notification %s was sent",
                message[:50] + "..." if len(message) > 50 else message,
            )
        else:
            logging.warning(
                "Failed to send Telegram notification %s",
                message[:50] + "..." if len(message) > 50 else message,
            )
    except Exception as e:
        logging.error("Error in background task sending Telegram notification: %s", e)


def _e(text) -> str:
    """HTML-escape dynamic text for Telegram HTML parse mode"""
    if text is None:
        return ""
    return html.escape(str(text))


def format_excessive_discount_message(
    bill_id: int,
    move_type: str,
    party_name: str,
    bill_time: str,
    wholesale_sum: float,
    bill_total: float,
    actual_discount: float,
    product_details: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """
    Format Telegram message for excessive discount notification in Arabic

    Args:
        bill_id: The bill ID
        move_type: Type of transaction
        party_name: Customer/party name
        bill_time: Bill timestamp
        wholesale_sum: Total wholesale cost
        bill_total: Final bill total after discount
        actual_discount: Actual discount amount applied
        product_details: List of product details
        store_name: Name of the store where transaction occurred
        user_name: Username who created the bill

    Returns:
        Formatted Arabic message string
    """

    # Calculate loss amount (how much below wholesale cost)
    loss_amount = wholesale_sum - bill_total
    loss_percentage = (loss_amount / wholesale_sum) * 100 if wholesale_sum > 0 else 0

    # Calculate what the total should be without excessive discount
    expected_total = sum(
        product["quantity"] * product["sale_price"] for product in product_details
    )

    # Format transaction type in Arabic
    type_mapping = {"sell": "بيع", "BNPL": "بيع آجل", "installment": "بيع بالتقسيط"}
    arabic_type = type_mapping.get(move_type, move_type)

    # Format date nicely
    try:
        from datetime import datetime

        dt = datetime.fromisoformat(bill_time.replace("Z", "+00:00"))
        formatted_date = dt.strftime("%Y-%m-%d %H:%M")
    except Exception as e:
        logger.error("Error formatting date: %s", e)
        formatted_date = bill_time

    # Format store and user information
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    # Create products list - simple and clean format
    products_text = ""
    for i, product in enumerate(product_details, 1):
        name = _e(product["name"])
        qty = product["quantity"]
        price = product["sale_price"]
        total_item = qty * price

        products_text += f"{i}. {name}\n"
        products_text += f"   🔢 الكمية: {qty} قطعة\n"
        products_text += f"   💰 السعر: {price:.2f} ج.م\n"
        products_text += f"   📊 الإجمالي: {total_item:.2f} ج.م\n"

        # Add spacing between products except for the last one
        if i < len(product_details):
            products_text += "\n"

    message = f"""🚨 <b>تنبيه عاجل: فاتورة بخصم مفرط</b> 🚨

🆔 <b>رقم الفاتورة:</b> {bill_id}
🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>الموظف:</b> {user_display}
📝 <b>نوع العملية:</b> {arabic_type}
👤 <b>العميل:</b> {_e(party_name)}
📅 <b>التاريخ:</b> {formatted_date}

━━━━━━━━━━━━━━━━━━━━

💰 <b>الملخص المالي:</b>

🏷️ <b>إجمالي سعر الشراء:</b> {wholesale_sum:.2f} ج.م
💵 <b>قيمة الفاتورة قبل الخصم:</b> {expected_total:.2f} ج.م
🎯 <b>قيمة الخصم المطبق:</b> {actual_discount:.2f} ج.م
💳 <b>إجمالي الفاتورة النهائي:</b> {bill_total:.2f} ج.م

⚠️ <b>مقدار الخسارة:</b> {loss_amount:.2f} ج.م ({loss_percentage:.1f}%)

━━━━━━━━━━━━━━━━━━━━

🛍️ <b>تفاصيل المنتجات:</b>

{products_text}

━━━━━━━━━━━━━━━━━━━━

🔴 <b>تحذير مهم:</b>
⚠️ إجمالي الفاتورة أقل من سعر الشراء
💸 هذا يعني خسارة مالية في هذه الصفقة
📞 يرجى المراجعة الفورية والتأكد من صحة الخصم
"""

    return message


def format_low_stock_message(
    products_below_zero: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """
    Format Telegram message for low/negative stock notification in Arabic

    Args:
        products_below_zero: List of products with stock below 0
        store_name: Name of the store where transaction occurred
        user_name: Username who created the bill

    Returns:
        Formatted Arabic message string
    """
    from datetime import datetime

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Format store and user information
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    # Create products list
    products_text = ""
    for i, product in enumerate(products_below_zero, 1):
        name = _e(product["name"])
        current_stock = product["stock"]
        quantity_sold = product.get("quantity_sold", "غير متاح")

        products_text += f"{i}. {name}\n"
        products_text += f"   🛒 الكمية المباعة: {quantity_sold} قطعة\n"
        products_text += f"   ⚠️ المخزون الحالي: {current_stock} قطعة\n"

        if i < len(products_below_zero):
            products_text += "\n"

    message = f"""⚠️ <b>تنبيه مخزون سالب</b> ⚠️

🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>الموظف:</b> {user_display}
📅 <b>التاريخ:</b> {current_time}

━━━━━━━━━━━━━━━━━━━━

📦 <b>منتجات بمخزون سالب:</b>

{products_text}"""

    return message


def check_stock_levels_after_sale(store_id: int, sold_products: List[Dict[str, Any]]):
    """
    Check stock levels after a sale and return products that are below or equal to 0

    Args:
        store_id: Store ID
        sold_products: List of products that were sold with their quantities

    Returns:
        List of products with stock <= 0
    """
    try:
        # Wait 1 second for database triggers to complete
        time.sleep(1)

        if not sold_products:
            logger.info("No products sold, skipping stock check")
            return []

        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        products_below_zero = []

        for sold_product in sold_products:
            product_id = sold_product["id"]
            quantity_sold = sold_product["quantity"]

            # Get current stock after the sale
            cur.execute(
                """
                SELECT p.name, pi.stock
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                WHERE p.id = %s AND pi.store_id = %s
                """,
                (product_id, store_id),
            )

            result = cur.fetchone()
            if result:
                current_stock = result["stock"]

                # Check if the product stock is <= 0
                if current_stock <= 0:
                    logger.warning(
                        f"Product '{result['name']}' stock is low/negative: {current_stock}"
                    )
                    products_below_zero.append(
                        {
                            "name": result["name"],
                            "stock": current_stock,
                            "product_id": product_id,
                            "quantity_sold": quantity_sold,
                        }
                    )
            else:
                logger.warning(
                    f"Product ID {product_id} not found in inventory for store {store_id}"
                )

        if products_below_zero:
            logger.info(f"Found {len(products_below_zero)} products with stock <= 0")

        cur.close()
        conn.close()

        return products_below_zero

    except Exception as e:
        logger.error(f"Error checking stock levels: {e}")
        return []


def send_low_stock_notification_background(
    store_id: int,
    products_below_zero: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
):
    """Background task to send low stock Telegram notification and create in-app notification"""
    try:
        if not products_below_zero:
            return

        # Create in-app notification
        from notifications import create_low_stock_notification

        create_low_stock_notification(store_id, products_below_zero)

        message = format_low_stock_message(
            products_below_zero=products_below_zero,
            store_name=store_name,
            user_name=user_name,
        )

        success = send_notification_to_store(store_id, message)

        if success:
            logging.info(
                "Low stock Telegram notification sent for %d products",
                len(products_below_zero),
            )
        else:
            logging.warning(
                "Failed to send low stock Telegram notification for %d products",
                len(products_below_zero),
            )
    except Exception as e:
        logging.error(
            "Error in background task sending low stock Telegram notification: %s", e
        )


def check_and_send_low_stock_notification(
    store_id: int,
    sold_products: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
):
    """
    Background task wrapper that checks stock levels and sends notification if needed
    """
    try:
        # Check stock levels (includes 1-second wait)
        products_below_zero = check_stock_levels_after_sale(store_id, sold_products)

        # Send notification if any products are below zero
        if products_below_zero:
            send_low_stock_notification_background(
                store_id, products_below_zero, store_name, user_name
            )
        else:
            logging.info("All products have positive stock")

    except Exception as e:
        logging.error(f"Error in background stock check task: {e}")


def format_store_transfer_message(
    source_store_name: str,
    destination_store_name: str,
    products: List[Dict[str, Any]],
    transfer_time: str,
    user_name: str = None,
) -> str:
    """
    Format Telegram message for store transfer notification in Arabic

    Args:
        source_store_name: Name of the source store
        destination_store_name: Name of the destination store
        products: List of transferred products with details
        transfer_time: Transfer timestamp
        user_name: Username who performed the transfer

    Returns:
        Formatted Arabic message string
    """
    # Format user information
    user_display = _e(user_name) if user_name else "غير محدد"

    # Create products list
    products_text = ""
    for i, product in enumerate(products, 1):
        name = _e(product.get("name", "منتج غير محدد"))
        quantity = product.get("quantity", 0)

        products_text += f"{i}. {name}\n"
        products_text += f"   📦 الكمية: {quantity} قطعة\n"

    message = f"""🔄 <b>تنبيه نقل منتجات بين المتاجر</b>

━━━━━━━━━━━━━━━━━━━━

📅 <b>تاريخ النقل:</b> {_e(transfer_time)}
👤 <b>المستخدم:</b> {user_display}

🏪 <b>من المتجر:</b> {_e(source_store_name)}
🏬 <b>إلى المتجر:</b> {_e(destination_store_name)}


━━━━━━━━━━━━━━━━━━━━

🛍️ <b>تفاصيل المنتجات المنقولة:</b>

{products_text}━━━━━━━━━━━━━━━━━━━━
"""

    return message


def check_due_installments(store_id: int):
    """
    Check for installments that are due today or overdue

    Args:
        store_id: Store ID to check installments for

    Returns:
        List of due installments with full details
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Query to get installments with their flow and calculate due dates
        query = """
        WITH installment_details AS (
            SELECT
                i.id,
                i.paid,
                i.installments_count,
                i.installment_interval,
                i.bill_id,
                -- Party information
                COALESCE(ap.name, 'عميل غير معروف') AS party_name,
                COALESCE(ap.phone, '') AS party_phone,
                -- Bill total from products_flow
                ABS(COALESCE(SUM(pf.price * pf.amount), 0)) as total,
                -- Last payment date (either from flow or bill creation)
                COALESCE(
                    (SELECT MAX(time) FROM installments_flow WHERE installment_id = i.id),
                    (SELECT time FROM bills WHERE id = i.bill_id)
                ) as last_payment_date,
                -- Products in the installment
                json_agg(
                    json_build_object(
                        'name', p.name,
                        'price', ABS(pf.price),
                        'amount', ABS(pf.amount),
                        'total', ABS(pf.price * pf.amount)
                    )
                ) as products,
                -- Payment flow
                (SELECT json_agg(
                    json_build_object(
                        'amount', amount,
                        'time', time::text
                    ) ORDER BY time
                ) FROM installments_flow WHERE installment_id = i.id) as flow
            FROM installments i
            JOIN bills b ON i.bill_id = b.id
            LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
            LEFT JOIN products_flow pf ON b.id = pf.bill_id AND b.store_id = pf.store_id
            LEFT JOIN products p ON pf.product_id = p.id
            WHERE i.store_id = %s
            GROUP BY i.id, i.paid, i.installments_count, i.installment_interval, i.bill_id, ap.name, ap.phone
        ),
        due_installments AS (
            SELECT
                *,
                -- Calculate total paid (deposit + flow payments)
                paid + COALESCE((
                    SELECT SUM(amount)
                    FROM installments_flow
                    WHERE installment_id = id
                ), 0) as total_paid,
                -- Calculate next due date
                last_payment_date + (installment_interval || ' days')::interval as next_due_date
            FROM installment_details
        )
        SELECT *
        FROM due_installments
        WHERE
            -- Not fully paid
            total_paid < total
            -- Due today or overdue
            AND next_due_date::date <= CURRENT_DATE
        ORDER BY next_due_date ASC
        """

        cur.execute(query, (store_id,))
        due_installments = cur.fetchall()

        cur.close()
        conn.close()

        return due_installments

    except Exception as e:
        logger.error(f"Error checking due installments: {e}")
        return []


def format_due_installments_message(
    due_installments: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """
    Format Telegram message for due installments notification in Arabic

    Args:
        due_installments: List of due installments with full details
        store_name: Name of the store
        user_name: Username who logged in

    Returns:
        Formatted Arabic message string
    """
    from datetime import datetime

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Format store and user information
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    if not due_installments:
        return f"""✅ <b>تم فتح شيفت جديد</b>

🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>المستخدم:</b> {user_display}
📅 <b>الوقت:</b> {current_time}
"""

    # Create installments list
    installments_text = ""

    for i, installment in enumerate(due_installments, 1):
        party_name = _e(installment.get("party_name", "عميل غير معروف"))
        party_phone = _e(installment.get("party_phone", "غير متاح"))
        installment_id = installment.get("id")
        total = installment.get("total", 0)
        total_paid = installment.get("total_paid", 0)
        remaining = total - total_paid
        next_due_date = installment.get("next_due_date")
        flow = installment.get("flow") or []
        products = installment.get("products") or []

        # Format due date
        try:
            due_date = datetime.fromisoformat(str(next_due_date).replace("Z", "+00:00"))
            formatted_due_date = due_date.strftime("%Y-%m-%d")

            # Check if overdue
            days_overdue = (datetime.now().date() - due_date.date()).days
            if days_overdue > 0:
                due_status = f"متأخر {days_overdue} يوم ⚠️"
            else:
                due_status = "مستحق اليوم 📅"
        except Exception as e:
            logger.error(f"Error formatting due date: {e}")
            formatted_due_date = str(next_due_date)
            due_status = "مستحق اليوم 📅"

        installments_text += f"🔸 <b>القسط رقم {installment_id}</b>\n"
        installments_text += f"👤 <b>العميل:</b> {party_name}\n"
        installments_text += f"📞 <b>الهاتف:</b> {party_phone}\n"
        installments_text += f"📅 <b>تاريخ الاستحقاق:</b> {formatted_due_date}\n"
        installments_text += f"⏰ <b>الحالة:</b> {due_status}\n"
        installments_text += f"💰 <b>إجمالي الفاتورة:</b> {total:.2f} ج.م\n"
        installments_text += f"✅ <b>المدفوع:</b> {total_paid:.2f} ج.م\n"
        installments_text += f"💳 <b>المتبقي:</b> {remaining:.2f} ج.م\n\n"

        # Add products details
        if products:
            installments_text += "🛍️ <b>منتجات القسط:</b>\n"
            for j, product in enumerate(products, 1):
                name = _e(product.get("name", "منتج غير محدد"))
                amount = product.get("amount", 0)
                price = product.get("price", 0)
                product_total = product.get("total", 0)

                installments_text += f"   {j}. {name}\n"
                installments_text += (
                    f"      الكمية: {amount} × {price:.2f} = {product_total:.2f} ج.م\n"
                )
            installments_text += "\n"

        # Add payment history if exists
        if flow:
            installments_text += "💰 <b>سجل المدفوعات:</b>\n"
            for payment in flow:
                amount = payment.get("amount", 0)
                payment_time = payment.get("time", "")
                try:
                    payment_date = datetime.fromisoformat(
                        payment_time.replace("Z", "+00:00")
                    )
                    formatted_payment_date = payment_date.strftime("%Y-%m-%d")
                except Exception as e:
                    logger.error(f"Error formatting payment date: {e}")
                    formatted_payment_date = payment_time

                installments_text += (
                    f"   • {amount:.2f} ج.م في {formatted_payment_date}\n"
                )

        # Add separator between installments
        if i < len(due_installments):
            installments_text += "\n━━━━━━━━━━━━━━━━━━━━\n\n"

        message = f"""✅ <b>تم فتح شيفت جديد</b>

🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>المستخدم:</b> {user_display}
📅 <b>الوقت:</b> {current_time}

━━━━━━━━━━━━━━━━━━━━

📊 <b>عدد الأقساط المستحقة:</b> {len(due_installments)}

━━━━━━━━━━━━━━━━━━━━

{installments_text}

━━━━━━━━━━━━━━━━━━━━

⚠️ <b>يرجى متابعة العملاء لتحصيل المبالغ المستحقة</b>"""

    return message


def send_due_installments_notification_background(
    store_id: int,
    store_name: str = None,
    user_name: str = None,
):
    """
    Background task to check for due installments and send Telegram notification
    Also creates in-app notifications for each due installment
    """
    try:
        # Check for due installments
        due_installments = check_due_installments(store_id)

        # Create in-app notifications for due installments
        if due_installments:
            from notifications import create_due_installments_notification

            create_due_installments_notification(store_id, due_installments)

        # Always send a notification (even if no due installments)
        message = format_due_installments_message(
            due_installments=due_installments,
            store_name=store_name,
            user_name=user_name,
        )

        success = send_notification_to_store(store_id, message)

        if success:
            count = len(due_installments)
            logging.info(
                f"Due installments Telegram notification sent for store {store_id}: {count} installments due"
            )
        else:
            logging.warning(
                f"Failed to send due installments Telegram notification for store {store_id}"
            )
    except Exception as e:
        logging.error(
            f"Error in background task sending due installments Telegram notification: {e}"
        )


def check_products_depleted_during_shift(store_id: int, shift_start_time: str):
    """
    Check for products that reached 0 or negative stock during the current shift
    (excluding products that were already at 0 or below when the shift started)

    Args:
        store_id: Store ID to check products for
        shift_start_time: When the current shift started

    Returns:
        List of products that were depleted during this shift
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get products that were sold/affected during this shift
        query = """
        WITH shift_product_movements AS (
            -- Get all product movements during this shift
            SELECT
                pf.product_id,
                SUM(pf.amount) as total_shift_movement,
                p.name as product_name
            FROM products_flow pf
            JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
            JOIN products p ON pf.product_id = p.id
            WHERE pf.store_id = %s
            AND b.time >= %s
            AND pf.bill_id > 0  -- Exclude manual adjustments (-1 bill)
            GROUP BY pf.product_id, p.name
            HAVING SUM(pf.amount) < 0  -- Only products that had net negative movement (were sold)
        ),
        current_and_pre_shift_stock AS (
            SELECT
                spm.product_id,
                spm.product_name,
                spm.total_shift_movement,
                pi.stock as current_stock,
                -- Calculate stock before shift started
                pi.stock - spm.total_shift_movement as stock_before_shift
            FROM shift_product_movements spm
            JOIN product_inventory pi ON spm.product_id = pi.product_id
                AND pi.store_id = %s
            WHERE pi.is_deleted = FALSE
        )
        SELECT
            product_id,
            product_name,
            current_stock,
            stock_before_shift,
            ABS(total_shift_movement) as consumed_amount
        FROM current_and_pre_shift_stock
        WHERE stock_before_shift > 0  -- Had positive stock before shift
        AND current_stock <= 0  -- Now at zero or below
        ORDER BY product_name
        """

        cur.execute(query, (store_id, shift_start_time, store_id))
        depleted_products = cur.fetchall()

        cur.close()
        conn.close()

        return depleted_products

    except Exception as e:
        logger.error(f"Error checking products depleted during shift: {e}")
        return []


def format_shift_closure_message(
    shift_data: Dict[str, Any],
    store_name: str = None,
    user_name: str = None,
    shift_start_time: str = None,
) -> str:
    """
    Format Telegram message for shift closure notification in Arabic (without depleted products)

    Args:
        shift_data: Dictionary containing shift financial summary
        store_name: Name of the store
        user_name: Username who closed the shift
        shift_start_time: When the shift started

    Returns:
        Formatted Arabic message string for shift closure summary
    """
    from datetime import datetime

    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Format store and user information
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    # Format shift duration
    shift_duration = "غير محدد"
    if shift_start_time:
        try:
            start_dt = datetime.fromisoformat(shift_start_time.replace("Z", "+00:00"))
            end_dt = datetime.now()
            duration = end_dt - start_dt
            hours = int(duration.total_seconds() // 3600)
            minutes = int((duration.total_seconds() % 3600) // 60)
            shift_duration = f"{hours} ساعة و {minutes} دقيقة"
            formatted_start_time = start_dt.strftime("%H:%M")
        except Exception as e:
            logger.error(f"Error formatting shift duration: {e}")
            formatted_start_time = shift_start_time
    else:
        formatted_start_time = "غير محدد"

    # Extract financial data
    sell_total = shift_data.get("sell_total", 0)
    buy_total = abs(shift_data.get("buy_total", 0))  # Make positive for display
    return_total = abs(shift_data.get("return_total", 0))  # Make positive for display
    installment_total = abs(shift_data.get("installment_total", 0))
    cash_in = shift_data.get("cash_in", 0)
    cash_out = shift_data.get("cash_out", 0)
    net_cash_flow = shift_data.get("net_cash_flow", 0)
    transaction_count = shift_data.get("transaction_count", 0)

    # Calculate gross revenue
    gross_revenue = sell_total - return_total

    # Calculate average transaction value
    avg_transaction = gross_revenue / transaction_count if transaction_count > 0 else 0

    # Get daily inventory summary
    inventory_summary = get_daily_inventory_summary(shift_data.get("store_id"))

    message = f"""🔐 <b>تم إغلاق الشيفت</b> 🔐

🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>المستخدم:</b> {user_display}
🕐 <b>وقت الإغلاق:</b> {current_time}
⏱️ <b>مدة الشيفت:</b> {shift_duration}
🚀 <b>بداية الشيفت:</b> {formatted_start_time}

━━━━━━━━━━━━━━━━━━━━

💰 <b>الملخص المالي:</b>

💵 <b>إجمالي المبيعات:</b> {sell_total:.2f} ج.م
🔄 <b>المرتجعات:</b> {return_total:.2f} ج.م
📈 <b>صافي المبيعات:</b> {gross_revenue:.2f} ج.م
🏦 <b>الأقساط المحصلة:</b> {installment_total:.2f} ج.م

💳 <b>الحركة النقدية:</b>
📈 <b>إجمالي الدخول:</b> {cash_in:.2f} ج.م
📉 <b>إجمالي الخروج:</b> {cash_out:.2f} ج.م
💰 <b>صافي الحركة النقدية:</b> {net_cash_flow:.2f} ج.م

━━━━━━━━━━━━━━━━━━━━

📊 <b>إحصائيات الشيفت:</b>

🧾 <b>عدد المعاملات:</b> {transaction_count}
💸 <b>متوسط قيمة المعاملة:</b> {avg_transaction:.2f} ج.م

━━━━━━━━━━━━━━━━━━━━

📋 <b>الجرد اليومي:</b>

🏷️ <b>قيمة المخزون (سعر الشراء):</b> {inventory_summary["wholesale_value"]:.2f} ج.م
💰 <b>قيمة المخزون (سعر البيع):</b> {inventory_summary["retail_value"]:.2f} ج.م
📦 <b>عدد الأصناف في المخزون:</b> {inventory_summary["total_products"]}

━━━━━━━━━━━━━━━━━━━━"""

    return message


def get_daily_inventory_summary(store_id: int) -> Dict[str, float]:
    """
    Get daily inventory summary for a specific store

    Args:
        store_id: Store ID to get inventory for

    Returns:
        Dictionary containing inventory values and counts
    """
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Get inventory summary with current stock values
        query = """
        SELECT
            COALESCE(SUM(pi.stock * p.wholesale_price), 0) as wholesale_value,
            COALESCE(SUM(pi.stock * p.price), 0) as retail_value,
            COUNT(CASE WHEN pi.stock > 0 THEN 1 END) as total_products
        FROM product_inventory pi
        JOIN products p ON pi.product_id = p.id
        WHERE pi.store_id = %s
        AND pi.is_deleted = FALSE
        """

        cur.execute(query, (store_id,))
        result = cur.fetchone()

        cur.close()
        conn.close()

        return {
            "wholesale_value": result["wholesale_value"] if result else 0,
            "retail_value": result["retail_value"] if result else 0,
            "total_products": result["total_products"] if result else 0,
        }

    except Exception as e:
        logger.error(f"Error getting daily inventory summary: {e}")
        return {
            "wholesale_value": 0,
            "retail_value": 0,
            "total_products": 0,
        }


def format_depleted_products_message(
    depleted_products: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """
    Format Telegram message for depleted products notification in Arabic

    Args:
        depleted_products: List of products that reached zero during shift
        store_name: Name of the store
        user_name: Username who closed the shift

    Returns:
        Formatted Arabic message string for depleted products or None if no products depleted
    """
    # If no products depleted, return None to skip sending this message
    if not depleted_products:
        return None

    # Format store and user information
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    # Create depleted products list
    products_text = ""
    for i, product in enumerate(depleted_products, 1):
        name = _e(product.get("product_name", "منتج غير محدد"))
        consumed = product.get("consumed_amount", 0)

        products_text += f"{i}. {name}\n"
        products_text += f"   📉 الكمية المستهلكة: {consumed} قطعة\n"
        products_text += (
            f"   ⚠️ المخزون الحالي: {product.get('current_stock', 0)} قطعة\n"
        )

        if i < len(depleted_products):
            products_text += "\n"

    message = f"""📦 <b>تنبيه: منتجات نفدت خلال الشيفت</b> 📦

🏪 <b>المتجر:</b> {store_display}
👨‍💼 <b>المستخدم:</b> {user_display}

━━━━━━━━━━━━━━━━━━━━

⚠️ <b>منتجات نفدت خلال الشيفت:</b>

{products_text}

━━━━━━━━━━━━━━━━━━━━

📋 <b>إجمالي المنتجات المنتهية: {len(depleted_products)} منتج</b>
🚚 <b>يرجى تجهيز هذه المنتجات للتوريد غداً</b>

━━━━━━━━━━━━━━━━━━━━"""

    return message


def send_shift_closure_notification_background(
    store_id: int,
    shift_data: Dict[str, Any],
    store_name: str = None,
    user_name: str = None,
    shift_start_time: str = None,
):
    """
    Background task to send shift closure Telegram notifications (split into two messages)
    """
    try:
        # Add store_id to shift_data for inventory calculation
        shift_data["store_id"] = store_id

        # Check for products that were depleted during the shift
        depleted_products = (
            check_products_depleted_during_shift(store_id, shift_start_time)
            if shift_start_time
            else []
        )

        # Format and send the shift closure summary message
        closure_message = format_shift_closure_message(
            shift_data=shift_data,
            store_name=store_name,
            user_name=user_name,
            shift_start_time=shift_start_time,
        )

        success_closure = send_notification_to_store(store_id, closure_message)

        if success_closure:
            logging.info(
                f"Shift closure summary Telegram notification sent for store {store_id}"
            )
        else:
            logging.warning(
                f"Failed to send shift closure summary Telegram notification for store {store_id}"
            )

        # Format and send the depleted products message (if any products depleted)
        depleted_message = format_depleted_products_message(
            depleted_products=depleted_products,
            store_name=store_name,
            user_name=user_name,
        )

        if depleted_message:  # Only send if there are depleted products
            # Add a small delay between messages
            time.sleep(2)

            success_depleted = send_notification_to_store(store_id, depleted_message)

            if success_depleted:
                logging.info(
                    f"Depleted products Telegram notification sent for store {store_id}: {len(depleted_products)} products"
                )
            else:
                logging.warning(
                    f"Failed to send depleted products Telegram notification for store {store_id}"
                )
        else:
            logging.info(f"No depleted products to notify for store {store_id}")

    except Exception as e:
        logging.error(
            f"Error in background task sending shift closure Telegram notification: {e}"
        )
