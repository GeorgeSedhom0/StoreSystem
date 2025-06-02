"""
Tests for Analytics Endpoints
Tests all analytics-related endpoints using real authentication
"""

from datetime import datetime, timedelta


class TestAnalyticsEndpoints:
    """Test class for analytics endpoints"""

    def test_get_analytics_alerts(self, authenticated_client):
        """Test getting analytics alerts"""
        response = authenticated_client.get("/analytics/alerts", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_post_analytics_sales(self, authenticated_client):
        """Test getting sales analytics"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        params = {
            "store_id": 1,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
        }

        # Request body should be a list of types
        types = ["sell", "return"]

        response = authenticated_client.post(
            "/analytics/sales", params=params, json=types
        )
        assert response.status_code in [200, 400]

    def test_get_analytics_income(self, authenticated_client):
        """Test getting income analytics"""
        response = authenticated_client.get(
            "/analytics/income",
            params={
                "store_id": 1,
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
            },
        )
        assert response.status_code in [200, 400]

    def test_get_analytics_top_products(self, authenticated_client):
        """Test getting top products analytics"""
        response = authenticated_client.get(
            "/analytics/top-products",
            params={
                "store_id": 1,
                "start_date": "2025-01-01",
                "end_date": "2025-12-31",
                "limit": 10,
            },
        )
        assert response.status_code in [200, 400]

    def test_post_analytics_products(self, authenticated_client):
        """Test getting products analytics with predictions"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        params = {
            "store_id": 1,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
        }

        # Request body should be a list of product IDs
        products_ids = [1, 2, 3]  # Using some sample product IDs

        response = authenticated_client.post(
            "/analytics/products", params=params, json=products_ids
        )
        assert response.status_code in [200, 400]

    def test_post_shifts_analytics(self, authenticated_client):
        """Test getting shifts analytics"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)

        params = {
            "store_id": 1,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
        }

        # Request body should be a list of bill types
        bills_type = ["sell", "return"]

        response = authenticated_client.post(
            "/shifts-analytics", params=params, json=bills_type
        )
        assert response.status_code in [200, 400]
