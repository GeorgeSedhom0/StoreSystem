# Store System Server

A comprehensive retail management system built with FastAPI, designed to handle inventory management, sales tracking, analytics, and customer relationship management.

## Features

- **Inventory Management**: Track products, stock levels, and suppliers
- **Sales Processing**: Handle transactions, bills, and returns
- **Analytics**: Sales predictions using machine learning
- **User Authentication**: Secure login and role-based access
- **Employee Management**: Track employee shifts and performance
- **Customer Management**: Handle customer data and installment payments
- **WhatsApp Integration**: Automated notifications and communication

## Installation

### Development Installation

1. Clone the repository
2. Navigate to the server directory
3. Install in editable mode:

```bash
pip install -e .
```

### Docker Installation

Build and run with Docker:

```bash
docker build -t store-system-server .
docker run -p 8000:8000 store-system-server
```

## Configuration

Create a `.env` file with the following variables:

```env
HOST=localhost
DATABASE=store
USER=postgres
PASS=your_password
```

## API Documentation

Once running, visit:

- Swagger UI: `https://localhost:8000/docs`
- ReDoc: `https://localhost:8000/redoc`

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

```bash
black .
flake8 .
```

## License

MIT License
