FROM python:3.9

WORKDIR /app

# Install PostgreSQL client
RUN apt-get update && apt-get install -y postgresql-client

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose the port your FastAPI app runs on
EXPOSE 8000