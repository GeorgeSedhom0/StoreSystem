#!/usr/bin/env python3
"""
Test script for the new WhatsApp service implementation
Run this to validate that the WhatsApp service is working correctly
"""

import requests
import json
import time
import sys

WHATSAPP_SERVICE_URL = "http://localhost:3001"
MAIN_API_URL = "http://localhost:8000"


def test_service_health():
    """Test WhatsApp service health endpoint"""
    print("🔍 Testing WhatsApp service health...")
    try:
        response = requests.get(f"{WHATSAPP_SERVICE_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Service health: {data}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False


def test_service_status():
    """Test WhatsApp service status endpoint"""
    print("🔍 Testing WhatsApp service status...")
    try:
        response = requests.get(f"{WHATSAPP_SERVICE_URL}/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Service status: {json.dumps(data, indent=2)}")
            return data
        else:
            print(f"❌ Status check failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Status check error: {e}")
        return None


def test_main_api_integration():
    """Test main API integration with WhatsApp service"""
    print("🔍 Testing main API integration...")
    try:
        response = requests.get(f"{MAIN_API_URL}/whatsapp/service-health", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Main API integration: {json.dumps(data, indent=2)}")
            return True
        else:
            print(f"❌ Main API integration failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Main API integration error: {e}")
        return False


def test_whatsapp_api_endpoints():
    """Test main WhatsApp API endpoints"""
    print("🔍 Testing WhatsApp API endpoints...")
    try:
        # Test status endpoint
        response = requests.get(f"{MAIN_API_URL}/whatsapp/status", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ WhatsApp status API: {json.dumps(data, indent=2)}")
            return True
        else:
            print(f"❌ WhatsApp status API failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ WhatsApp status API error: {e}")
        return False


def main():
    """Run all tests"""
    print("🚀 Starting WhatsApp service tests...\n")

    tests = [
        ("Service Health", test_service_health),
        ("Service Status", test_service_status),
        ("Main API Integration", test_main_api_integration),
        ("WhatsApp API Endpoints", test_whatsapp_api_endpoints),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        print(f"\n📋 Running test: {test_name}")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} PASSED")
            else:
                print(f"❌ {test_name} FAILED")
        except Exception as e:
            print(f"❌ {test_name} ERROR: {e}")

        time.sleep(1)  # Brief pause between tests

    print(f"\n📊 Test Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! WhatsApp service is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Check the logs above for details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
