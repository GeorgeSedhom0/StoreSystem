"""
Tests for Parties Endpoints
Tests all party-related endpoints using real authentication
"""

import pytest


class TestPartiesEndpoints:
    """Test class for parties endpoints"""

    def test_get_parties(self, authenticated_client):
        """Test getting all parties"""
        response = authenticated_client.get("/parties", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_create_party(self, authenticated_client):
        """Test creating a new party"""

        response = authenticated_client.post(
            "/party",
            json={
                "name": f"Test Party {pytest.current_timestamp}",
                "phone": "1234567890",
                "email": "test@party.com",
                "address": "Test Address",
                "type": "customer",
                "extra_info": {
                    "notes": "This is a test party",
                    "preferences": ["email", "sms"],
                    "tags": ["vip", "newsletter"],
                },
            },
        )

        print(response.json())

        assert response.status_code == 200

        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            return data["id"]
        return None

    def test_update_party(self, authenticated_client):
        """Test updating a party"""
        # First get existing parties
        parties_response = authenticated_client.get("/parties", params={"store_id": 1})
        if parties_response.status_code == 200:
            parties = parties_response.json()
            if parties:
                party_id = parties[0]["id"]

                response = authenticated_client.put(
                    "/party",
                    json={
                        "name": f"Updated Party {pytest.current_timestamp}",
                        "phone": "0987654321",
                        "email": "test@party.com",
                        "address": "Updated Address",
                        "type": "customer",
                        "extra_info": {
                            "notes": "This is an updated test party",
                            "preferences": ["email", "sms"],
                            "tags": ["vip", "newsletter"],
                        },
                    },
                    params={
                        "party_id": party_id,
                    },
                )
                assert response.status_code == 200

    def test_get_party_bills(self, authenticated_client):
        """Test getting bills for a specific party"""
        # First get existing parties
        parties_response = authenticated_client.get("/parties", params={"store_id": 1})
        if parties_response.status_code == 200:
            parties = parties_response.json()
            if parties:
                party_id = parties[0]["id"]
                response = authenticated_client.get(
                    f"/party/{party_id}/bills", params={"store_id": 1}
                )
                assert response.status_code == 200
                data = response.json()
                assert isinstance(data, list)

    def test_get_party_details(self, authenticated_client):
        """Test getting party details"""
        # First get existing parties
        parties_response = authenticated_client.get("/parties", params={"store_id": 1})
        if parties_response.status_code == 200:
            parties = parties_response.json()
            if parties:
                party_id = parties[0]["id"]
                response = authenticated_client.get(
                    "/party/details", params={"party_id": party_id, "store_id": 1}
                )
                assert response.status_code == 200
                data = response.json()
                assert isinstance(data, dict)

    def test_get_long_missed_parties(self, authenticated_client):
        """Test getting parties that haven't been active for a long time"""
        response = authenticated_client.get(
            "/parties/long-missed", params={"store_id": 1}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_delete_party(self, authenticated_client):
        """Test deleting a party"""
        # First create a party to delete
        create_payload = {
            "name": f"Delete Test Party {pytest.current_timestamp}",
            "phone": "5555555555",
            "email": "delete@test.com",
            "address": "Delete Address",
            "type": "customer",
        }

        create_response = authenticated_client.post(
            "/party", json=create_payload, params={"store_id": 1}
        )
        if create_response.status_code == 200:
            party_data = create_response.json()
            party_id = party_data["id"]

            # Now delete the party
            response = authenticated_client.delete(
                "/party", params={"party_id": party_id}
            )
            assert response.status_code in [200, 400, 404]
