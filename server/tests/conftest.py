# Test Configuration
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from server.main import app
from typing import Generator
import time


# Test credentials for real authentication
TEST_USERNAME = "george"
TEST_PASSWORD = "verystrongpassword"
TEST_STORE_ID = 1


@pytest.fixture(scope="session")
def authenticated_client() -> Generator[TestClient, None, None]:
    """Create a test client with real authentication"""
    with TestClient(app) as test_client:
        # Login with real credentials to get cookies
        form_data = {
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
        }

        login_response = test_client.post(
            "/login", data=form_data, params={"store_id": TEST_STORE_ID}
        )

        if login_response.status_code != 200:
            pytest.fail(
                f"Authentication failed: {login_response.status_code} - {login_response.text}"
            )  # Extract the access_token cookie from login response
        access_token = login_response.cookies.get("access_token")

        if not access_token:
            pytest.fail("No access_token cookie found in login response")

        # Create a new TestClient that will include the auth cookie in all requests
        class AuthenticatedTestClient(TestClient):
            def request(self, method, url, **kwargs):
                # Add the access_token cookie to all requests
                if "cookies" not in kwargs or kwargs["cookies"] is None:
                    kwargs["cookies"] = {}
                kwargs["cookies"]["access_token"] = access_token
                return super().request(method, url, **kwargs)

        auth_client = AuthenticatedTestClient(app)
        yield auth_client


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create a test client for the FastAPI app"""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def mock_db():
    """Mock database cursor for unit tests"""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = None
    mock_cursor.rowcount = 0
    return mock_cursor


@pytest.fixture
def mock_current_user():
    """Mock authenticated user"""
    return {"id": 1, "username": "test_user", "role": "admin", "store_id": 1}


@pytest.fixture
def current_timestamp():
    """Generate current timestamp for unique test data"""
    return int(time.time())


# Make timestamp available globally for pytest
def pytest_configure():
    import time

    pytest.current_timestamp = int(time.time())


@pytest.fixture
def sample_product():
    """Sample product data for testing"""
    return {
        "name": "Test Product",
        "bar_code": "1234567890",
        "wholesale_price": 10.50,
        "price": 15.99,
        "category": "Electronics",
        "stock": 100,
    }


@pytest.fixture
def sample_bill():
    """Sample bill data for testing"""
    return {
        "time": "2025-06-01T10:00:00",
        "discount": 5.00,
        "total": 150.99,
        "products_flow": [
            {"id": 1, "quantity": 2, "price": 15.99, "wholesale_price": 10.50}
        ],
    }


@pytest.fixture
def timestamp():
    """Generate a unique timestamp for test data"""
    return int(time.time())


# Database setup and teardown for integration tests
@pytest.fixture(scope="session")
def test_db():
    """Setup test database for integration tests"""
    # This would create a test database
    # You might want to use a separate test database
    pass
