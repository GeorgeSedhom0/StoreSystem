from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import requests
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["whatsapp"])

# Database connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# WhatsApp Service URL
WHATSAPP_SERVICE_URL = getenv("WHATSAPP_SERVICE_URL", "http://localhost:3001")


class WhatsAppConfigRequest(BaseModel):
    action: str  # "connect" or "disconnect"


class WhatsAppTestMessageRequest(BaseModel):
    phone_number: str
    message: str


class WhatsAppStoreNumberRequest(BaseModel):
    store_id: int
    phone_number: str


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


@router.post("/whatsapp/configure")
async def configure_whatsapp(request: WhatsAppConfigRequest):
    """Configure WhatsApp connection"""
    try:
        if request.action == "connect":
            # Start new connection and wait for QR code or connection
            logger.info("Initiating new WhatsApp connection")
            result = call_whatsapp_service("connect", method="POST", timeout=60)

            if result.get("success"):
                # Return the result which includes QR code or connection status
                return {
                    "success": True,
                    "message": result.get("message", "WhatsApp connection initiated"),
                    "qr_code": result.get("qr_code"),
                    "connected": result.get("connected", False),
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to start WhatsApp connection: {result.get('message')}",
                }

        elif request.action == "disconnect":
            logger.info("Disconnecting WhatsApp")
            result = call_whatsapp_service("disconnect", method="POST", timeout=20)

            if result.get("success"):
                return {
                    "success": True,
                    "message": "WhatsApp disconnected successfully",
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to disconnect WhatsApp: {result.get('message')}",
                }
        else:
            raise HTTPException(status_code=400, detail="Invalid action")

    except Exception as e:
        logger.error(f"Error configuring WhatsApp: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/whatsapp/status")
async def get_whatsapp_status_endpoint():
    """Get current WhatsApp connection status"""
    try:
        # Get fresh status directly from Node.js handler
        logger.info("Getting fresh WhatsApp status")
        status = get_whatsapp_status()

        return {"success": True, "status": status}
    except Exception as e:
        logger.error(f"Error getting WhatsApp status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.post("/whatsapp/test-message")
async def send_test_message(request: WhatsAppTestMessageRequest):
    """Send a test message"""
    try:
        # Check connection first
        status = get_whatsapp_status()
        if not status.get("connected"):
            raise HTTPException(status_code=400, detail="WhatsApp not connected")

        # Format phone number
        phone = format_phone_number(request.phone_number)

        # Send message using WhatsApp service
        logger.info(f"Sending test message to {phone}")
        result = call_whatsapp_service(
            "send",
            method="POST",
            data={"phone_number": phone, "message": request.message},
            timeout=30,
        )

        if result.get("success"):
            return {"success": True, "message": "Test message sent successfully"}
        else:
            return {
                "success": False,
                "message": result.get("message", "Failed to send message"),
            }

    except Exception as e:
        logger.error(f"Error sending test message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/whatsapp/store-number")
async def set_store_whatsapp_number(request: WhatsAppStoreNumberRequest):
    """Set WhatsApp notification number for a specific store"""
    try:
        success = save_store_whatsapp_number(request.store_id, request.phone_number)
        if success:
            return {
                "success": True,
                "message": "Store WhatsApp number set successfully",
            }
        else:
            return {"success": False, "message": "Failed to set store WhatsApp number"}
    except Exception as e:
        logger.error(f"Error setting store WhatsApp number: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/whatsapp/store-number/{store_id}")
async def get_store_whatsapp_number_endpoint(store_id: int):
    """Get WhatsApp notification number for a specific store"""
    try:
        phone_number = get_store_whatsapp_number(store_id)
        return {"success": True, "phone_number": phone_number}
    except Exception as e:
        logger.error(f"Error getting store WhatsApp number: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/whatsapp/service-health")
async def get_service_health():
    """Get WhatsApp service health status for debugging"""
    try:
        # Try to get detailed status from service
        service_status = None
        is_healthy = False

        try:
            # Check if service is responding
            response = requests.get(f"{WHATSAPP_SERVICE_URL}/health", timeout=5)
            is_healthy = response.status_code == 200
            service_status = call_whatsapp_service("status", timeout=5)
        except Exception as e:
            logger.error(f"Error getting service status: {e}")

        return {
            "success": True,
            "service_healthy": is_healthy,
            "service_url": WHATSAPP_SERVICE_URL,
            "service_status": service_status,
        }
    except Exception as e:
        logger.error(f"Error checking service health: {e}")
        raise HTTPException(status_code=500, detail=str(e))
