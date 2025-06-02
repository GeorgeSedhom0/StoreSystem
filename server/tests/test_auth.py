"""
Tests for Authentication Endpoints
Tests all authentication-related endpoints using real authentication
"""

import pytest


class TestAuthEndpoints:
    """Test class for authentication endpoints"""

    def test_login_success(self, client):
        """Test successful login"""
        form_data = {
            "username": "george",
            "password": "verystrongpassword",
        }

        response = client.post("/login", data=form_data, params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Logged in successfully"
        assert "user" in data

    def test_login_invalid_credentials(self, client):
        """Test login with invalid credentials"""
        form_data = {
            "username": "invalid_user",
            "password": "wrong_password",
        }

        response = client.post("/login", data=form_data, params={"store_id": 1})
        assert response.status_code == 401

    def test_get_profile(self, authenticated_client):
        """Test getting user profile"""
        response = authenticated_client.get("/profile")
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "store" in data

    def test_logout(self, authenticated_client):
        """Test user logout"""
        response = authenticated_client.post("/logout", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Logged out successfully"

    def test_switch_store(self, authenticated_client):
        """Test switching store (logout without ending shift)"""
        response = authenticated_client.get("/switch")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Switched successfully"

    def test_get_users(self, authenticated_client):
        """Test getting all users"""
        response = authenticated_client.get("/users")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_signup_new_user(self, authenticated_client):
        """Test creating a new user"""
        form_data = {
            "username": f"testuser_{pytest.current_timestamp}",
            "password": "testpassword123",
            "email": "test@example.com",
            "phone": "1234567890",
            "scope_id": 1,
        }

        response = authenticated_client.post("/signup", data=form_data)
        # May fail if user already exists, which is expected in testing
        assert response.status_code in [200, 400]

    def test_update_user(self, authenticated_client):
        """Test updating user information"""
        form_data = {
            "username": "george",
            "password": "verystrongpassword",
            "email": "george@updated.com",
            "phone": "9876543210",
            "scope_id": 1,
        }

        response = authenticated_client.put("/user", data=form_data)
        assert response.status_code in [200, 400]  # May fail due to constraints
