from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging
from dotenv import load_dotenv
from os import getenv
from telegram_utils import (
    call_telegram_api,
    validate_bot_token,
    get_telegram_status,
    get_telegram_updates,
    send_telegram_message,
    get_store_telegram_chat_id,
    save_store_telegram_chat_id,
    TELEGRAM_BOT_TOKEN,
)
from auth_middleware import get_current_user

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["telegram"])


class TelegramConfigRequest(BaseModel):
    bot_token: str


class TelegramTestMessageRequest(BaseModel):
    chat_id: str
    message: str


class TelegramStoreChatIdRequest(BaseModel):
    store_id: int
    chat_id: str


@router.get("/telegram/status")
async def get_telegram_status_endpoint(current_user: dict = Depends(get_current_user)):
    """Get current Telegram bot connection status"""
    try:
        status = get_telegram_status()
        return {"success": True, "status": status}
    except Exception as e:
        logger.error(f"Error getting Telegram status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/configure")
async def configure_telegram(
    request: TelegramConfigRequest, current_user: dict = Depends(get_current_user)
):
    """Validate and configure a Telegram bot token"""
    try:
        # Validate the provided token
        result = validate_bot_token(request.bot_token)

        if result.get("success"):
            # Token is valid - update the module-level token
            import telegram_utils

            telegram_utils.TELEGRAM_BOT_TOKEN = request.bot_token

            return {
                "success": True,
                "message": "تم تكوين بوت تليجرام بنجاح",
                "bot_info": {
                    "username": result.get("bot_username"),
                    "name": result.get("bot_name"),
                },
            }
        else:
            return {
                "success": False,
                "message": result.get("message", "رمز البوت غير صالح"),
            }

    except Exception as e:
        logger.error(f"Error configuring Telegram: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/test-message")
async def send_test_message(
    request: TelegramTestMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a test message via Telegram"""
    try:
        # Check bot is configured
        status = get_telegram_status()
        if not status.get("connected"):
            raise HTTPException(status_code=400, detail="Telegram bot not configured")

        # Send message
        logger.info(f"Sending test message to chat_id {request.chat_id}")
        result = send_telegram_message(request.chat_id, request.message)

        if result.get("success"):
            return {"success": True, "message": "تم إرسال الرسالة التجريبية بنجاح"}
        else:
            return {
                "success": False,
                "message": result.get("message", "فشل في إرسال الرسالة"),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending test message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/store-chat-id")
async def set_store_chat_id(
    request: TelegramStoreChatIdRequest,
    current_user: dict = Depends(get_current_user),
):
    """Set Telegram chat ID for a specific store"""
    try:
        success = save_store_telegram_chat_id(request.store_id, request.chat_id)
        if success:
            return {
                "success": True,
                "message": "تم حفظ معرف المحادثة بنجاح",
            }
        else:
            return {"success": False, "message": "فشل في حفظ معرف المحادثة"}
    except Exception as e:
        logger.error(f"Error setting store chat ID: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telegram/store-chat-id/{store_id}")
async def get_store_chat_id_endpoint(
    store_id: int, current_user: dict = Depends(get_current_user)
):
    """Get Telegram chat ID for a specific store"""
    try:
        chat_id = get_store_telegram_chat_id(store_id)
        return {"success": True, "chat_id": chat_id}
    except Exception as e:
        logger.error(f"Error getting store chat ID: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telegram/updates")
async def get_updates_endpoint(current_user: dict = Depends(get_current_user)):
    """Fetch recent messages to the bot for auto-detecting chat IDs"""
    try:
        status = get_telegram_status()
        if not status.get("connected"):
            raise HTTPException(status_code=400, detail="Telegram bot not configured")

        updates = get_telegram_updates()
        return {"success": True, "updates": updates}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting Telegram updates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/telegram/service-health")
async def get_service_health(current_user: dict = Depends(get_current_user)):
    """Get Telegram bot health status for debugging"""
    try:
        status = get_telegram_status()
        return {
            "success": True,
            "service_healthy": status.get("connected", False),
            "bot_username": status.get("bot_username"),
        }
    except Exception as e:
        logger.error(f"Error checking service health: {e}")
        raise HTTPException(status_code=500, detail=str(e))
