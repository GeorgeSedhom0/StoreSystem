# WhatsApp Service Documentation

## Overview

The new WhatsApp implementation provides a robust, persistent WhatsApp service that runs continuously and auto-restarts on failures. It replaces the old command-line based approach with a proper service architecture.

## Architecture

### WhatsApp Service (Node.js)

- **File**: `whatsapp_utils/whatsapp_service.js`
- **Port**: 3001
- **Features**:
  - Persistent WhatsApp connection
  - Auto-restart on failures (max 3 attempts)
  - Session data persistence across restarts
  - HTTP API for commands
  - Graceful error handling

### API Endpoints

#### Health Check

- **GET** `/health`
- Returns service status and uptime

#### Status

- **GET** `/status`
- Returns WhatsApp connection status, phone number, and QR code if available

#### Connect

- **POST** `/connect`
- Initializes WhatsApp connection or returns current status if already connected
- Returns QR code for scanning if not authenticated

#### Disconnect

- **POST** `/disconnect`
- Disconnects and cleans up WhatsApp session

#### Send Message

- **POST** `/send`
- Body: `{"phone_number": "+1234567890", "message": "Hello"}`
- Sends WhatsApp message

### Python Integration

- **File**: `whatsapp.py`
- Uses HTTP requests to communicate with the WhatsApp service
- Maintains all existing API endpoints for the frontend
- Improved error handling and connection management

## Key Improvements

1. **Persistence**: Service runs continuously, maintaining connection state
2. **Reliability**: Auto-restart mechanism with exponential backoff
3. **Session Management**: Proper session data persistence across container restarts
4. **Better Error Handling**: Service remains available even after failures
5. **Cleaner Architecture**: Separation of concerns between service and API layer
6. **Health Monitoring**: Built-in health check endpoints

## Deployment

### Docker Setup

- Service starts automatically with the container via `start_services.sh`
- Exposes port 3001 for the WhatsApp service
- Volume mounts ensure session data persistence

### Testing

Use `test_service.js` to verify the service is working:

```bash
cd whatsapp_utils
node test_service.js
```

## Configuration

- Session data stored in `/app/whatsapp_data`
- Service listens on `0.0.0.0:3001`
- Auto-restart: 3 attempts with 10-second delays
- Graceful shutdown on SIGTERM/SIGINT

## Migration from Old System

The old command-line based `whatsapp_handler.js` has been completely replaced. All existing API endpoints remain the same, ensuring frontend compatibility.
