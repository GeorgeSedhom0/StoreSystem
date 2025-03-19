FROM python:3.9

WORKDIR /app

# Install PostgreSQL client, OpenSSL, and tzdata for timezone support
RUN apt-get update && apt-get install -y postgresql-client openssl tzdata

# Set timezone
ENV TZ=Africa/Cairo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN dpkg-reconfigure -f noninteractive tzdata

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create SSL directory
RUN mkdir -p /app/ssl

# Generate self-signed certificate with 100-year validity
RUN openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
    -keyout /app/ssl/key.pem \
    -out /app/ssl/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Copy the rest of the application
COPY . .

# Create a timezone initialization file
RUN echo 'import os; import time; os.environ["TZ"] = "Africa/Cairo"; time.tzset()' > /app/tzinit.py

# Expose the port your FastAPI app runs on
EXPOSE 8000