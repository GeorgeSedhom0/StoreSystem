#!/usr/bin/env python3
"""
Health check script for WhatsApp service
This script checks if the WhatsApp service is running and healthy
"""

import requests
import sys
import time


def check_whatsapp_service():
    """Check if WhatsApp service is running and responding"""
    try:
        response = requests.get("http://localhost:3001/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("status") == "running":
                print("✓ WhatsApp service is running and healthy")
                return True
        print("✗ WhatsApp service responded but is not healthy")
        return False
    except requests.exceptions.ConnectionError:
        print("✗ WhatsApp service is not responding (connection refused)")
        return False
    except requests.exceptions.Timeout:
        print("✗ WhatsApp service health check timed out")
        return False
    except Exception as e:
        print(f"✗ Error checking WhatsApp service: {e}")
        return False


def wait_for_service(max_attempts=30, delay=2):
    """Wait for WhatsApp service to become available"""
    print("Waiting for WhatsApp service to start...")

    for attempt in range(max_attempts):
        if check_whatsapp_service():
            return True

        print(f"Attempt {attempt + 1}/{max_attempts} - Retrying in {delay} seconds...")
        time.sleep(delay)

    print(f"✗ WhatsApp service failed to start after {max_attempts} attempts")
    return False


if __name__ == "__main__":
    # Check if we should wait for service or just check once
    if len(sys.argv) > 1 and sys.argv[1] == "--wait":
        success = wait_for_service()
    else:
        success = check_whatsapp_service()

    sys.exit(0 if success else 1)
