"""
WhatsApp service initializer
This module ensures the WhatsApp service is available when the main app starts
"""

import requests
import logging
import time
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class WhatsAppServiceChecker:
    def __init__(self, service_url: str = "http://localhost:3001"):
        self.service_url = service_url
        self.is_healthy = False
        self.last_check = 0
        self.check_interval = 30  # Check every 30 seconds
        self._stop_monitoring = False
        self._monitor_thread: Optional[threading.Thread] = None

    def check_health(self) -> bool:
        """Check if WhatsApp service is healthy"""
        try:
            response = requests.get(f"{self.service_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.is_healthy = (
                    data.get("success", False) and data.get("status") == "running"
                )
                return self.is_healthy
        except Exception as e:
            logger.debug(f"WhatsApp service health check failed: {e}")

        self.is_healthy = False
        return False

    def wait_for_service(self, max_wait: int = 60) -> bool:
        """Wait for WhatsApp service to become available"""
        logger.info("Waiting for WhatsApp service to become available...")

        start_time = time.time()
        while time.time() - start_time < max_wait:
            if self.check_health():
                logger.info("WhatsApp service is available")
                return True
            time.sleep(2)

        logger.warning(f"WhatsApp service not available after {max_wait} seconds")
        return False

    def start_monitoring(self):
        """Start background monitoring of WhatsApp service"""
        if self._monitor_thread and self._monitor_thread.is_alive():
            return

        self._stop_monitoring = False
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()
        logger.info("Started WhatsApp service monitoring")

    def stop_monitoring(self):
        """Stop background monitoring"""
        self._stop_monitoring = True
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
        logger.info("Stopped WhatsApp service monitoring")

    def _monitor_loop(self):
        """Background monitoring loop"""
        while not self._stop_monitoring:
            try:
                current_time = time.time()
                if current_time - self.last_check >= self.check_interval:
                    was_healthy = self.is_healthy
                    self.check_health()

                    if was_healthy != self.is_healthy:
                        if self.is_healthy:
                            logger.info("WhatsApp service is now healthy")
                        else:
                            logger.warning("WhatsApp service is no longer healthy")

                    self.last_check = current_time

                time.sleep(5)  # Check every 5 seconds for stop signal
            except Exception as e:
                logger.error(f"Error in WhatsApp service monitoring: {e}")
                time.sleep(10)


# Global instance
whatsapp_checker = WhatsAppServiceChecker()


def init_whatsapp_service():
    """Initialize WhatsApp service connection"""
    # Wait for service to be available
    if whatsapp_checker.wait_for_service(max_wait=120):
        # Start background monitoring
        whatsapp_checker.start_monitoring()
        return True
    return False


def is_whatsapp_service_healthy() -> bool:
    """Check if WhatsApp service is currently healthy"""
    return whatsapp_checker.is_healthy


def get_whatsapp_service_url() -> str:
    """Get WhatsApp service URL"""
    return whatsapp_checker.service_url
