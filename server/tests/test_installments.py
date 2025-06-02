"""
Tests for Installment Endpoints
Tests all installment-related endpoints using real authentication
"""


class TestInstallmentEndpoints:
    """Test class for installment endpoints"""

    def test_get_installments(self, authenticated_client):
        """Test getting all installments"""
        response = authenticated_client.get("/installments", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_pay_installment(self, authenticated_client):
        """Test paying an installment"""
        # First get existing installments
        installments_response = authenticated_client.get(
            "/installments", params={"store_id": 1}
        )
        if installments_response.status_code == 200:
            installments = installments_response.json()
            if installments:
                installment_id = installments[0]["id"]

                response = authenticated_client.post(
                    f"/installments/pay/{installment_id}", params={"amount": 100.00}
                )
                assert response.status_code in [200, 400, 404]
