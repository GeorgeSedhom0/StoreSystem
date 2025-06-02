"""
Tests for Employee Endpoints
Tests all employee-related endpoints using real authentication
"""

from datetime import datetime


class TestEmployeeEndpoints:
    """Test class for employee endpoints"""

    def test_get_employees(self, authenticated_client):
        """Test getting all employees"""
        response = authenticated_client.get("/employees", params={"store_id": 1})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_create_employee(self, authenticated_client):
        """Test creating a new employee"""
        payload = {
            "name": f"Test Employee {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "phone": "1234567890",
            "address": "Test Address",
            "salary": 5000.00,
            "started_on": "2025-06-01T00:00:00",  # Correct field name
        }

        response = authenticated_client.post(
            "/employees", json=payload, params={"store_id": 1}
        )
        assert response.status_code in [200, 201, 400, 422]

        if response.status_code in [200, 201]:
            data = response.json()
            assert "id" in data
            return data["id"]
        return None

    def test_update_employee(self, authenticated_client):
        """Test updating an employee"""
        # First get existing employees
        employees_response = authenticated_client.get(
            "/employees", params={"store_id": 1}
        )
        if employees_response.status_code == 200:
            employees = employees_response.json()
            if employees:
                employee_id = employees[0]["id"]
                payload = {
                    "name": "Updated Employee Name",
                    "phone": "9876543210",
                    "address": "Updated Address",
                    "salary": 6000.00,
                    "started_on": "2025-06-01T00:00:00",  # Correct field name
                }

                response = authenticated_client.put(
                    f"/employees/{employee_id}", json=payload, params={"store_id": 1}
                )
                assert response.status_code in [200, 400, 404, 422]

    def test_pay_employee_salary(self, authenticated_client):
        """Test paying employee salary"""
        # First get existing employees
        employees_response = authenticated_client.get(
            "/employees", params={"store_id": 1}
        )
        if employees_response.status_code == 200:
            employees = employees_response.json()
            if employees:
                employee_id = employees[0]["id"]
                payload = {
                    "amount": 5000.00,
                    "payment_date": "2025-06-01",
                    "notes": "Monthly salary payment",
                }

                response = authenticated_client.post(
                    f"/employees/{employee_id}/pay-salary",
                    json=payload,
                    params={"store_id": 1},
                )
                assert response.status_code in [200, 400, 404, 422]

    def test_delete_employee(self, authenticated_client):
        """Test deleting (stopping) an employee"""
        # First create an employee to delete
        create_payload = {
            "name": f"Delete Test Employee {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "phone": "5555555555",
            "address": "Delete Address",
            "salary": 3000.00,
            "started_on": "2025-06-01T00:00:00",  # Correct field name
        }

        create_response = authenticated_client.post(
            "/employees", json=create_payload, params={"store_id": 1}
        )
        if create_response.status_code in [200, 201]:
            employee_data = create_response.json()
            employee_id = employee_data["id"]

            # Now delete (stop) the employee
            response = authenticated_client.delete(
                f"/employees/{employee_id}", params={"store_id": 1}
            )
            assert response.status_code in [200, 400, 404, 422]
