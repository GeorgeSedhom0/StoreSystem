from setuptools import setup, find_packages

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [
        line.strip() for line in fh if line.strip() and not line.startswith("#")
    ]

setup(
    name="store-system-server",
    version="1.0.0",
    author="Store System Team",
    description="Store System Server - A comprehensive retail management system",
    long_description="A FastAPI-based server for managing retail operations including inventory, sales, analytics, and more.",
    long_description_content_type="text/plain",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: End Users/Desktop",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.9",
    install_requires=requirements,
    include_package_data=True,
    package_data={
        "": ["*.json", "*.yml", "*.yaml", "*.sql", "*.md", "*.html", "*.pem"],
    },
)
