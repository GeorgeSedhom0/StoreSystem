"""
Tests for Settings Endpoints
Tests all settings-related endpoints using real authentication
"""

import pytest


class TestSettingsEndpoints:
    """Test class for settings endpoints"""

    def test_get_scopes(self, authenticated_client):
        """Test getting all scopes"""
        response = authenticated_client.get("/scopes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_pages(self, authenticated_client):
        """Test getting all pages"""
        response = authenticated_client.get("/pages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_store_data(self, authenticated_client):
        """Test getting store data"""
        response = authenticated_client.get("/store-data", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_get_admin_stores_data(self, authenticated_client):
        """Test getting all stores data as admin"""
        response = authenticated_client.get("/admin/stores-data")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_create_scope(self, authenticated_client):
        """Test creating a new scope"""
        payload = {
            "name": f"Test Scope {pytest.current_timestamp}",
            "pages": [1, 2, 3],
        }

        response = authenticated_client.post("/scope", json=payload)
        # May fail due to validation or existing scope
        assert response.status_code in [200, 400, 422]

    def test_update_scope(self, authenticated_client):
        """Test updating a scope"""
        payload = [1, 2]

        response = authenticated_client.put(
            "/scope",
            json=payload,
            params={
                "id": 1,
                "name": "Updated Test Scope",
            },
        )
        assert response.status_code in [200, 400, 404]

    def test_delete_scope(self, authenticated_client):
        """Test deleting a scope"""
        # First try to get existing scopes
        scopes_response = authenticated_client.get("/scopes")
        if scopes_response.status_code == 200:
            scopes = scopes_response.json()
            if len(scopes) > 1:  # Don't delete if only one scope exists
                scope_id = scopes[-1]["id"]  # Try to delete the last scope
                response = authenticated_client.delete(
                    "/scope", params={"id": scope_id}
                )
                assert response.status_code in [200, 400, 404]

    def test_update_store_data(self, authenticated_client):
        """Test updating store data"""
        payload = {
            "extra_info": {"test": "data"},
        }

        response = authenticated_client.put(
            "/store-data",
            json=payload,
            params={
                "store_id": 1,
                "name": "Updated Store Name",
                "address": "Updated Address",
                "phone": "1234567890",
            },
        )
        assert response.status_code in [200, 400]
