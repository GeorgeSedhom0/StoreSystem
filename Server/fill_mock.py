import psycopg2
import random
import string
import datetime
from fastapi.testclient import TestClient
from main import app
from main import Product, ProductFlow, Bill
from dotenv import load_dotenv
from os import getenv

client = TestClient(app)
load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


# Function to generate a random product
def generate_product():
    name = "منتج " + ''.join(
        random.choices(string.ascii_letters + string.digits, k=10))
    bar_code = ''.join(random.choices(string.digits, k=12))
    wholesale_price = round(random.uniform(10, 100), 2)
    price = round(wholesale_price * (1 + random.uniform(0.1, 0.5)), 2)
    category = "تصنيف " + ''.join(
        random.choices(string.ascii_letters + string.digits, k=10))
    return Product(name=name,
                   bar_code=bar_code,
                   wholesale_price=wholesale_price,
                   price=price,
                   category=category,
                   stock=0)


# Function to generate a random bill
def generate_bill():
    time = datetime.datetime.now().isoformat()
    discount = round(random.uniform(0, 0.2), 2)
    total = round(random.uniform(100, 5000), 2)
    number_of_products = random.randint(1, 10)
    start_point = random.randint(100, 4000)
    products_flow = [
        ProductFlow(id=i,
                    quantity=random.randint(1, 10),
                    price=round(random.uniform(10, 100), 2),
                    wholesale_price=round(random.uniform(5, 50), 2))
        for i in range(start_point, start_point + number_of_products)
    ]
    return Bill(time=time,
                discount=discount,
                total=total,
                products_flow=products_flow)


# Add 4,000 mock products
for _ in range(4000):
    product = generate_product()
    response = client.post("/product", json=product.dict())
    print(f"Added product: {response.json()}")

# Add 1,000 mock bills
for _ in range(2000):
    bill = generate_bill()
    response = client.post("/bill",
                           json=bill.dict(),
                           params={"move_type": "sale"})
    print(f"Added bill: {response.json()}")
