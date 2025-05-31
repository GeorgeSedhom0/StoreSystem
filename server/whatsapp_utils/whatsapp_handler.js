const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

// Global state management
let globalClient = null;
let isAuthenticating = false;
let qrCodeData = null;
let lastQrTimestamp = 0;

class WhatsAppHandler {
  constructor() {
    this.client = globalClient;
    this.isReady = this.client ? true : false;
    this.qrCode = qrCodeData;
    this.sessionPath = "/app/whatsapp_data";
    this.clientPromise = null;
  }

  initializeClient() {
    // If global client exists, use it
    if (globalClient) {
      this.client = globalClient;
      return;
    }

    // Ensure the session directory exists
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }

    console.error("Initializing new WhatsApp client instance");
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionPath,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-field-trial-config",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-popup-blocking",
          "--disable-prompt-on-repost",
          "--disable-sync",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
          "--no-default-browser-check",
          "--password-store=basic",
          "--use-mock-keychain",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-translate",
          "--disable-logging",
          "--disable-login-animations",
          "--disable-notifications",
          "--hide-scrollbars",
          "--mute-audio",
          "--disable-default-apps",
          "--disable-zero-browsers-open-for-tests",
          "--disable-background-mode",
          "--remote-debugging-port=0",
        ],
        ignoreDefaultArgs: false,
        executablePath: null,
      },
    });

    globalClient = this.client;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on("qr", (qr) => {
      console.error("New QR code generated");
      this.generateQRCode(qr);
      lastQrTimestamp = Date.now();
    });

    this.client.on("ready", () => {
      console.error("WhatsApp client is ready!");
      this.isReady = true;
      isAuthenticating = false;
    });

    this.client.on("authenticated", () => {
      console.error("WhatsApp client authenticated!");
      qrCodeData = null; // Clear QR code once authenticated
    });

    this.client.on("auth_failure", (msg) => {
      console.error("Authentication failed:", msg);
      this.isReady = false;
      isAuthenticating = false;
      this.cleanup(); // Clean up on auth failure
    });

    this.client.on("disconnected", (reason) => {
      console.error("WhatsApp client disconnected:", reason);
      this.isReady = false;
      isAuthenticating = false;
      qrCodeData = null;
      this.cleanup(); // Clean up on disconnect
    });
  }

  generateQRCode(qr) {
    // Convert QR to base64 image
    const QRCode = require("qrcode");

    QRCode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error("Error generating QR code:", err);
        qrCodeData = null;
      } else {
        console.error("QR code generated successfully");
        qrCodeData = url;
        this.qrCode = url;
      }
    });
  }

  async getStatus() {
    try {
      console.error("Checking WhatsApp connection status...");

      // Check if we have an active client
      if (globalClient) {
        try {
          // If client exists but not yet ready, we're in QR waiting state
          if (!this.isReady && qrCodeData) {
            return {
              connected: false,
              authenticating: true,
              qr_code: qrCodeData,
              phone_number: null,
              qr_timestamp: lastQrTimestamp,
            };
          }

          // Get actual client state
          const state = await globalClient.getState();
          const phoneNumber = globalClient.info?.wid?.user || null;
          const connected = state === "CONNECTED";

          return {
            connected: connected,
            authenticating: isAuthenticating,
            qr_code: qrCodeData,
            phone_number: phoneNumber,
            qr_timestamp: lastQrTimestamp,
          };
        } catch (error) {
          console.error("Error getting client state:", error);
          return {
            connected: false,
            authenticating: isAuthenticating,
            qr_code: qrCodeData,
            phone_number: null,
            qr_timestamp: lastQrTimestamp,
          };
        }
      }

      // Check if session exists when no client
      const authFolder = path.join(this.sessionPath, ".wwebjs_auth");
      const sessionExists = fs.existsSync(authFolder);

      if (!sessionExists) {
        console.error("No WhatsApp session exists");
        return {
          connected: false,
          authenticating: false,
          qr_code: null,
          phone_number: null,
          qr_timestamp: 0,
        };
      }

      return {
        connected: false,
        authenticating: isAuthenticating,
        qr_code: qrCodeData,
        phone_number: null,
        qr_timestamp: lastQrTimestamp,
      };
    } catch (error) {
      console.error("Error in getStatus:", error);
      return {
        connected: false,
        authenticating: false,
        qr_code: null,
        phone_number: null,
        qr_timestamp: 0,
      };
    }
  }

  async cleanup(force = false) {
    if (force || !isAuthenticating) {
      console.error("Cleaning up WhatsApp client instance");
      if (globalClient) {
        try {
          await globalClient.destroy();
          console.error("WhatsApp client destroyed successfully");
        } catch (error) {
          console.error("Error destroying client:", error);
        } finally {
          globalClient = null;
          qrCodeData = null;
          this.client = null;
          this.isReady = false;
        }
      }
    } else {
      console.error("Skipping cleanup as authentication is in progress");
    }
  }

  async connect() {
    try {
      // If we're already authenticating, return current status
      if (isAuthenticating && globalClient) {
        console.error(
          "Authentication already in progress, returning current status",
        );
        return {
          success: true,
          message: "WhatsApp authentication in progress",
          status: await this.getStatus(),
        };
      }

      // If not authenticating, clean up any existing client
      await this.cleanup(true);

      // Create a new client instance
      this.initializeClient();
      isAuthenticating = true;

      console.error("Starting WhatsApp client initialization...");

      // Initialize the client (don't await here - it will run in background)
      this.client.initialize();

      // Return immediately with initial status
      return {
        success: true,
        message: "WhatsApp connection initiated, check status for updates",
        status: {
          connected: false,
          authenticating: true,
          qr_code: null, // QR code will be available in future status checks
          phone_number: null,
          qr_timestamp: 0,
        },
      };
    } catch (error) {
      console.error("Error connecting to WhatsApp:", error);
      isAuthenticating = false;

      await this.cleanup(true);

      return {
        success: false,
        message: error.message,
      };
    }
  }

  async disconnect() {
    try {
      isAuthenticating = false;

      // Only attempt logout if we have a client
      if (globalClient) {
        try {
          await globalClient.logout();
        } catch (error) {
          console.error("Error logging out:", error);
        }
      }

      // Always clean up
      await this.cleanup(true);

      return {
        success: true,
        message: "WhatsApp disconnected successfully",
      };
    } catch (error) {
      console.error("Error disconnecting WhatsApp:", error);
      await this.cleanup(true);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async sendMessage(phoneNumber, message) {
    try {
      // Create a client instance
      if (!this.client) {
        this.initializeClient();
        await this.client.initialize();
      }

      // Wait for client to be ready
      if (!this.isReady) {
        console.log("Waiting for client to be ready...");
        for (let i = 0; i < 10; i++) {
          if (this.isReady) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!this.isReady) {
          throw new Error("WhatsApp client failed to become ready");
        }
      }

      // Format phone number (ensure it includes country code)
      let formattedNumber = phoneNumber.replace(/[^\d+]/g, "");

      // Add @c.us suffix for individual chats
      if (!formattedNumber.includes("@")) {
        formattedNumber = formattedNumber + "@c.us";
      }

      console.log(`Sending message to ${formattedNumber}: ${message}`);
      await this.client.sendMessage(formattedNumber, message);

      // Cleanup after sending
      await this.cleanup();

      return { success: true, message: "Message sent successfully" };
    } catch (error) {
      console.error("Error sending message:", error);

      // Clean up if error occurred
      await this.cleanup();

      return { success: false, message: error.message };
    }
  }
}

// Create a new handler for each command
function createHandler() {
  return new WhatsAppHandler();
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const handler = createHandler();

  try {
    let result;

    switch (command) {
      case "connect":
        result = await handler.connect();
        console.log(JSON.stringify(result));
        break;

      case "status":
        result = await handler.getStatus();
        console.log(JSON.stringify({ success: true, status: result }));
        process.exit(0); // Exit immediately after status
        break;

      case "disconnect":
        result = await handler.disconnect();
        console.log(JSON.stringify(result));
        process.exit(0); // Exit immediately after disconnect
        break;

      case "send":
        const phoneNumber = args[1];
        const message = args[2];

        if (!phoneNumber || !message) {
          console.log(
            JSON.stringify({
              success: false,
              message: "Phone number and message are required",
            }),
          );
          process.exit(1);
        }

        const sendResult = await handler.sendMessage(phoneNumber, message);
        console.log(JSON.stringify(sendResult));
        break;

      default:
        console.log(
          JSON.stringify({
            success: false,
            message:
              "Invalid command. Use: connect, disconnect, status, or send",
          }),
        );
        process.exit(1);
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    console.log(JSON.stringify({ success: false, message: error.message }));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main:", error);
  console.log(JSON.stringify({ success: false, message: error.message }));
  process.exit(1);
});
