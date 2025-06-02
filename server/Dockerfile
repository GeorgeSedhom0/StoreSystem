FROM python:3.9

WORKDIR /app

# Update and install basic dependencies 
RUN apt-get update && apt-get install -y wget gnupg2 lsb-release curl

# Add PostgreSQL repository properly
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
RUN wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

# Clean apt cache and update
RUN apt-get clean && apt-get update

# Install PostgreSQL 17 client explicitly and remove any other versions
RUN apt-get install -y postgresql-client-17 openssl tzdata && \
    apt-get remove -y postgresql-client-15 || true

# Verify the installed version
RUN pg_dump --version

# Rest of your Dockerfile remains the same
ENV TZ=Africa/Cairo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN dpkg-reconfigure -f noninteractive tzdata

# Copy package files first for better caching
COPY requirements.txt setup.py pyproject.toml MANIFEST.in ./
COPY __init__.py ./

# Install the package in editable mode (this will install dependencies)
RUN pip install --no-cache-dir -e .

# Install test requirements if they exist
COPY tests/test_requirements.txt .
RUN pip install --no-cache-dir -r test_requirements.txt

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

# Start the main FastAPI application directly
CMD ["uvicorn", "main_wrapper:app", "--host", "0.0.0.0", "--port", "8000", "--ssl-keyfile=/app/ssl/key.pem", "--ssl-certfile=/app/ssl/cert.pem", "--reload"]