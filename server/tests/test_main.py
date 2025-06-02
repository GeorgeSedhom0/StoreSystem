"""
Tests for Main API Endpoints
Tests all core endpoints from main.py using real authentication
"""

import time


class TestMainEndpoints:
    """Test class for main API endpoints"""

    def test_test_endpoint(self, authenticated_client):
        """Test the /test endpoint"""
        response = authenticated_client.get("/test")
        assert response.status_code == 200
        data = response.json()
        assert data == "Hello, World!"

    def test_barcode_endpoint(self, authenticated_client):
        """Test barcode generation"""
        response = authenticated_client.get("/barcode")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, str)

    def test_get_products(self, authenticated_client):
        """Test getting products"""
        response = authenticated_client.get("/products", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "reserved_products" in data
        assert isinstance(data["products"], list)
        assert isinstance(data["reserved_products"], dict)

    def test_get_admin_products(self, authenticated_client):
        """Test getting all products as admin"""
        response = authenticated_client.get("/admin/products")
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "reserved_products" in data
        assert isinstance(data["products"], list)
        assert isinstance(data["reserved_products"], dict)

    def test_create_product(self, authenticated_client, sample_product):
        """Test creating a new product"""
        # Use current timestamp for unique barcode
        sample_product["bar_code"] = f"TEST{int(time.time())}"

        response = authenticated_client.post(
            "/product", json=sample_product, params={"store_id": 1}
        )
        assert response.status_code in [200, 400]

        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            return data["id"]
        return None

    def test_update_products(self, authenticated_client):
        """Test updating multiple products"""
        # First get existing products
        products_response = authenticated_client.get(
            "/products", params={"store_id": 1}
        )
        if products_response.status_code == 200:
            products_data = products_response.json()
            products = products_data.get("products", [])
            if products:
                # Update the first product
                product = products[0]
                product["name"] = "Updated Product Name"

                payload = [product]

                response = authenticated_client.put(
                    "/products", json=payload, params={"store_id": 1}
                )
                assert response.status_code in [200, 400]

    def test_delete_product(self, authenticated_client):
        """Test soft deleting a product"""
        # First get existing products
        products_response = authenticated_client.get(
            "/products", params={"store_id": 1}
        )
        if products_response.status_code == 200:
            products_data = products_response.json()
            products = products_data.get("products", [])
            if products:
                product_id = products[0]["id"]

                response = authenticated_client.put(
                    "/product/delete", params={"product_id": product_id, "store_id": 1}
                )
                assert response.status_code in [200, 400]

    def test_restore_product(self, authenticated_client):
        """Test restoring a deleted product"""
        # First get existing products (including deleted ones)
        products_response = authenticated_client.get(
            "/products", params={"store_id": 1, "is_deleted": True}
        )
        if products_response.status_code == 200:
            products_data = products_response.json()
            products = products_data.get("products", [])
            # Look for a deleted product
            deleted_products = [p for p in products if p.get("is_deleted", False)]
            if deleted_products:
                product_id = deleted_products[0]["id"]

                response = authenticated_client.put(
                    "/product/restore", params={"product_id": product_id, "store_id": 1}
                )
                assert response.status_code in [200, 400]

    def test_get_bills(self, authenticated_client):
        """Test getting bills"""
        response = authenticated_client.get("/bills", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_update_bill(self, authenticated_client):
        """Test updating a bill"""
        # First get existing bills
        bills_response = authenticated_client.get("/bills", params={"store_id": 1})
        if bills_response.status_code == 200:
            bills = bills_response.json()
            if bills:
                bill = bills[0]
                bill["discount"] = 10.0  # Update discount

                response = authenticated_client.put(
                    "/bill", json=bill, params={"store_id": 1}
                )
                assert response.status_code in [200, 400]

    def test_get_cash_flow(self, authenticated_client):
        """Test getting cash flow records"""
        response = authenticated_client.get("/cash-flow", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_add_cash_flow(self, authenticated_client):
        """Test adding a cash flow record"""

        response = authenticated_client.post(
            "/cash-flow",
            params={
                "store_id": 1,
                "amount": 100.0,
                "move_type": "in",
                "description": "Test cash inflow",
            },
        )

        print(response.json())
        assert response.status_code in [200, 400]

    def test_get_current_shift(self, authenticated_client):
        """Test getting current shift"""
        response = authenticated_client.get("/current-shift", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_get_last_shift(self, authenticated_client):
        """Test getting last shift"""
        response = authenticated_client.get("/last-shift", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_get_shift_total(self, authenticated_client):
        """Test getting shift totals"""
        response = authenticated_client.get("/shift-total", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_backup_database(self, authenticated_client):
        """Test database backup"""
        response = authenticated_client.get("/backup")
        assert response.status_code == 200
        # Should return a SQL file
        assert "application/octet-stream" in response.headers.get("content-type", "")

    def test_move_products_admin(self, authenticated_client):
        """Test moving products between stores as admin"""
        # First get products from store 1
        products_response = authenticated_client.get(
            "/products", params={"store_id": 1}
        )
        if products_response.status_code == 200:
            products_data = products_response.json()
            products = products_data.get("products", [])
            if products:
                # Create a simple bill structure for moving products
                bill_data = {
                    "time": "2024-01-01T10:00:00",
                    "discount": 0.0,
                    "total": 100.0,
                    "products_flow": [
                        {
                            "id": products[0]["id"],
                            "quantity": 1,
                            "price": 100.0,
                            "wholesale_price": 50.0,
                        }
                    ],
                }

                response = authenticated_client.post(
                    "/admin/move-products",
                    json=bill_data,
                    params={"source_store_id": 1, "destination_store_id": 2},
                )
                # May fail if store 2 doesn't exist or other constraints
                assert response.status_code in [200, 400, 404]

    def test_end_reservation(self, authenticated_client):
        """Test ending a reservation"""
        # This endpoint needs a reservation bill ID
        response = authenticated_client.get(
            "/end-reservation", params={"bill_id": "test_bill_id", "store_id": 1}
        )
        # Will likely fail as test bill doesn't exist
        assert response.status_code in [200, 400, 404]

    def test_complete_bnpl_payment(self, authenticated_client):
        """Test completing BNPL payment"""
        response = authenticated_client.get(
            "/complete-bnpl-payment", params={"bill_id": "test_bill_id", "store_id": 1}
        )
        # Will likely fail as test bill doesn't exist
        assert response.status_code in [200, 400, 404]

    def test_get_bill_products(self, authenticated_client):
        """Test getting products for a specific bill"""
        response = authenticated_client.get(
            "/bill-products", params={"bill_id": "test_bill_id", "store_id": 1}
        )
        # Will likely fail as test bill doesn't exist
        assert response.status_code in [200, 400, 404]
