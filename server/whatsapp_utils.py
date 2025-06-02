from typing import List, Dict, Any
import logging
from os import getenv
import requests
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# WhatsApp Service URL
WHATSAPP_SERVICE_URL = getenv("WHATSAPP_SERVICE_URL", "http://localhost:3001")

# Database connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


def get_store_whatsapp_number(store_id: int):
    """Get WhatsApp notification number for a specific store"""
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
        result = cur.fetchone()

        cur.close()
        conn.close()

        if result and result["extra_info"]:
            extra_info = result["extra_info"]
            return extra_info.get("whatsapp_number")
        return None
    except Exception as e:
        logger.error(f"Error getting store WhatsApp number: {e}")
        return None


def save_store_whatsapp_number(store_id: int, phone_number: str):
    """Save WhatsApp notification number for a specific store"""
    try:
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
        result = cur.fetchone()

        extra_info = result["extra_info"] if result and result["extra_info"] else {}
        extra_info["whatsapp_number"] = phone_number

        cur.execute(
            "UPDATE store_data SET extra_info = %s WHERE id = %s",
            (json.dumps(extra_info), store_id),
        )

        conn.commit()
        cur.close()
        conn.close()

        return True
    except Exception as e:
        logger.error(f"Error saving store WhatsApp number: {e}")
        return False


def get_whatsapp_status():
    """Get current WhatsApp status directly from the WhatsApp service"""
    result = call_whatsapp_service("status", timeout=10)

    # Convert to the expected format
    if result.get("success"):
        status = result.get("status", {})
        if isinstance(status, dict):
            return {
                "connected": status.get("connected", False),
                "phone_number": status.get("phone_number"),
            }
        else:
            logger.warning(f"Unexpected status format: {status}")
            return {
                "connected": False,
                "phone_number": None,
            }
    else:
        logger.error(f"Failed to get WhatsApp status: {result.get('message')}")
        return {
            "connected": False,
            "phone_number": None,
        }


def format_phone_number(phone_number):
    """Format phone number for WhatsApp"""
    phone = (
        phone_number.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    )

    if not phone.startswith("+"):
        # Assume Egypt number if no country code and starts with 01
        if phone.startswith("01") and len(phone) == 11:
            phone = "+2" + phone
        else:
            phone = "+" + phone

    return phone


def call_whatsapp_service(endpoint, method="GET", data=None, timeout=30):
    """Call the WhatsApp service API"""
    try:
        url = f"{WHATSAPP_SERVICE_URL}/{endpoint}"

        if method == "GET":
            response = requests.get(url, timeout=timeout)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=timeout)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")

        response.raise_for_status()
        return response.json()

    except requests.exceptions.ConnectionError:
        logger.error("Cannot connect to WhatsApp service. Is it running?")
        return {"success": False, "message": "WhatsApp service unavailable"}
    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling WhatsApp service: {endpoint}")
        return {"success": False, "message": "Request timeout"}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling WhatsApp service: {e}")
        return {"success": False, "message": str(e)}
    except Exception as e:
        logger.error(f"Unexpected error calling WhatsApp service: {e}")
        return {"success": False, "message": str(e)}


def send_notification_to_store(store_id: int, message: str):
    """Send WhatsApp notification to a specific store's configured number"""
    try:
        # Get fresh status
        status = get_whatsapp_status()
        if not status.get("connected"):
            logger.warning("WhatsApp not connected, cannot send notification")
            return False

        phone_number = get_store_whatsapp_number(store_id)
        if not phone_number:
            logger.warning(f"No WhatsApp number configured for store {store_id}")
            return False

        # Format phone number
        phone = format_phone_number(phone_number)

        # Send message using WhatsApp service
        logger.info(f"Sending notification to store {store_id} at {phone}")
        result = call_whatsapp_service(
            "send",
            method="POST",
            data={"phone_number": phone, "message": message},
            timeout=45,
        )

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


def send_whatsapp_notification_background(store_id: int, message: str):
    """Background task to send WhatsApp notification"""
    try:
        success = send_notification_to_store(store_id, message)

        if success:
            logging.info(
                "WhatsApp notification %s was sent",
                message[:50] + "..." if len(message) > 50 else message,
            )
        else:
            logging.warning(
                "Failed to send WhatsApp notification %s",
                message[:50] + "..." if len(message) > 50 else message,
            )
    except Exception as e:
        logging.error("Error in background task sending WhatsApp notification: %s", e)


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
    Format WhatsApp message for excessive discount notification in Arabic

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
    store_display = store_name if store_name else "غير محدد"
    user_display = user_name if user_name else "غير محدد"

    # Create products list - simple and clean format
    products_text = ""
    for i, product in enumerate(product_details, 1):
        name = product["name"]
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

    message = f"""🚨 *تنبيه عاجل: فاتورة بخصم مفرط* 🚨

🆔 *رقم الفاتورة:* {bill_id}
🏪 *المتجر:* {store_display}
👨‍💼 *الموظف:* {user_display}
📝 *نوع العملية:* {arabic_type}
👤 *العميل:* {party_name}
📅 *التاريخ:* {formatted_date}

━━━━━━━━━━━━━━━━━━━━

💰 *الملخص المالي:*

🏷️ *إجمالي سعر الشراء:* {wholesale_sum:.2f} ج.م
💵 *قيمة الفاتورة قبل الخصم:* {expected_total:.2f} ج.م
🎯 *قيمة الخصم المطبق:* {actual_discount:.2f} ج.م
💳 *إجمالي الفاتورة النهائي:* {bill_total:.2f} ج.م

⚠️ *مقدار الخسارة:* {loss_amount:.2f} ج.م ({loss_percentage:.1f}%)

━━━━━━━━━━━━━━━━━━━━

🛍️ *تفاصيل المنتجات:*

{products_text}

━━━━━━━━━━━━━━━━━━━━

🔴 *تحذير مهم:*
⚠️ إجمالي الفاتورة أقل من سعر الشراء
💸 هذا يعني خسارة مالية في هذه الصفقة
📞 يرجى المراجعة الفورية والتأكد من صحة الخصم

━━━━━━━━━━━━━━━━━━━━

🤖 _تم إرسال هذا التنبيه تلقائياً من نظام إدارة المتجر_"""

    return message
