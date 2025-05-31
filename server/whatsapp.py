from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import subprocess
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

# WhatsApp Node.js handler paths
WHATSAPP_HANDLER_PATH = "/app/whatsapp_utils/whatsapp_handler.js"
WHATSAPP_DATA_PATH = "/app/whatsapp_data"


class WhatsAppConfigRequest(BaseModel):
    action: str  # "connect" or "disconnect"


class WhatsAppTestMessageRequest(BaseModel):
    phone_number: str
    message: str


class WhatsAppStoreNumberRequest(BaseModel):
    store_id: int
    phone_number: str


def run_node_command(command_args, timeout=30):
    """Run a Node.js WhatsApp command and return the result"""
    try:
        cmd = ["node", "whatsapp_handler.js"] + command_args
        logger.info(f"Running WhatsApp command: {cmd}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd="/app/whatsapp_utils",
        )

        if result.stdout:
            # Trim any potential extra output and find the JSON part
            stdout = result.stdout.strip()
            # Try to find JSON object start and end
            start_idx = stdout.find("{")
            if start_idx >= 0:
                try:
                    # Parse just the JSON part
                    return json.loads(stdout[start_idx:])
                except json.JSONDecodeError as e:
                    logger.error(f"JSON parsing error: {e}")
                    logger.error(f"Problematic stdout: {stdout}")
                    return {
                        "success": False,
                        "message": "Invalid JSON response format",
                    }
            else:
                logger.error(f"No JSON object found in: {stdout}")
                return {
                    "success": False,
                    "message": "No valid JSON response found",
                }

        if result.stderr:
            # Just log stderr for debugging, don't use it for parsing
            logger.debug(f"Node.js stderr output: {result.stderr}")

        # If we got here, there was no valid JSON output
        return {"success": False, "message": "No response from WhatsApp handler"}

    except subprocess.TimeoutExpired:
        logger.error(f"Command timeout: {command_args}")
        return {"success": False, "message": "Command timeout"}
    except Exception as e:
        logger.error(f"Error running command {command_args}: {e}")
        return {"success": False, "message": str(e)}


@router.post("/whatsapp/configure")
async def configure_whatsapp(request: WhatsAppConfigRequest):
    """Configure WhatsApp connection"""
    try:
        if request.action == "connect":
            # Start new connection - on-demand approach
            logger.info("Initiating new WhatsApp connection")
            result = run_node_command(["connect"], timeout=60)

            if result.get("success"):
                # Just return the status, QR code will be fetched in polling
                status = result.get("status", {})
                logger.info(
                    "WhatsApp connection initiated, polling for QR code will begin"
                )

                return {
                    "success": True,
                    "message": "WhatsApp connection initiated, polling for QR code",
                    "status": status,
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to start WhatsApp connection: {result.get('message')}",
                }

        elif request.action == "disconnect":
            logger.info("Disconnecting WhatsApp")
            result = run_node_command(["disconnect"], timeout=20)

            if result.get("success"):
                return {
                    "success": True,
                    "message": "WhatsApp disconnected successfully",
                    "status": get_whatsapp_status(),
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
        # Always get fresh status directly from Node.js handler
        logger.info("Getting fresh WhatsApp status")
        status = get_whatsapp_status()

        # Log if a QR code is available
        if status.get("qr_code"):
            logger.info("QR code is available in status response")

        return {"success": True, "status": status}
    except Exception as e:
        logger.error(f"Error getting WhatsApp status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_whatsapp_status():
    """Get current WhatsApp status directly from the Node.js handler"""
    result = run_node_command(["status"], timeout=15)

    # Convert to the expected format
    if result.get("success"):
        status = result.get("status", {})
        if isinstance(status, dict):
            return {
                "connected": status.get("connected", False),
                "authenticating": status.get("authenticating", False),
                "phone_number": status.get("phone_number"),
                "qr_code": status.get("qr_code"),
                "qr_timestamp": status.get("qr_timestamp", 0),
            }
        else:
            logger.warning(f"Unexpected status format: {status}")
            return {
                "connected": False,
                "authenticating": False,
                "phone_number": None,
                "qr_code": None,
                "qr_timestamp": 0,
            }
    else:
        logger.error(f"Failed to get WhatsApp status: {result.get('message')}")
        return {
            "connected": False,
            "authenticating": False,
            "phone_number": None,
            "qr_code": None,
            "qr_timestamp": 0,
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

        # Send message using Node.js handler
        logger.info(f"Sending test message to {phone}")
        result = run_node_command(["send", phone, request.message], timeout=30)

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

        # Send message using Node.js handler with longer timeout
        logger.info(f"Sending notification to store {store_id} at {phone}")
        result = run_node_command(["send", phone, message], timeout=45)

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
