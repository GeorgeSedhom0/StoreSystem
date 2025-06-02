from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import requests
import logging
from dotenv import load_dotenv
from os import getenv
from whatsapp_utils import (
    call_whatsapp_service,
    WHATSAPP_SERVICE_URL,
    get_whatsapp_status,
    format_phone_number,
    get_store_whatsapp_number,
    save_store_whatsapp_number,
)
from auth_middleware import get_current_user

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


class WhatsAppConfigRequest(BaseModel):
    action: str  # "connect" or "disconnect"


class WhatsAppTestMessageRequest(BaseModel):
    phone_number: str
    message: str


class WhatsAppStoreNumberRequest(BaseModel):
    store_id: int
    phone_number: str


@router.post("/whatsapp/configure")
async def configure_whatsapp(
    request: WhatsAppConfigRequest, current_user: dict = Depends(get_current_user)
):
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
async def get_whatsapp_status_endpoint(current_user: dict = Depends(get_current_user)):
    """Get current WhatsApp connection status"""
    try:
        # Get fresh status directly from Node.js handler
        logger.info("Getting fresh WhatsApp status")
        status = get_whatsapp_status()

        return {"success": True, "status": status}
    except Exception as e:
        logger.error(f"Error getting WhatsApp status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/whatsapp/test-message")
async def send_test_message(
    request: WhatsAppTestMessageRequest, current_user: dict = Depends(get_current_user)
):
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
async def set_store_whatsapp_number(
    request: WhatsAppStoreNumberRequest, current_user: dict = Depends(get_current_user)
):
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
async def get_store_whatsapp_number_endpoint(
    store_id: int, current_user: dict = Depends(get_current_user)
):
    """Get WhatsApp notification number for a specific store"""
    try:
        phone_number = get_store_whatsapp_number(store_id)
        return {"success": True, "phone_number": phone_number}
    except Exception as e:
        logger.error(f"Error getting store WhatsApp number: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/whatsapp/service-health")
async def get_service_health(current_user: dict = Depends(get_current_user)):
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
