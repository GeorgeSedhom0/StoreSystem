// WhatsApp Service - Persistent WhatsApp instance
const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const fs = require("fs");
const path = require("path");

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.isConnected = false;
    this.currentQR = null;
    this.phoneNumber = null;
    this.sessionPath = "/app/whatsapp_data";
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.restartDelay = 10000; // 10 seconds
    this.app = express();
    this.server = null;
    this.port = 3001;

    // Setup express middleware
    this.app.use(express.json());
    this.setupRoutes();

    // Ensure session directory exists
    this.ensureDirectories();

    // Start the service
    this.start();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      console.log(`Created session directory: ${this.sessionPath}`);
    }
  }

  setupRoutes() {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({
        success: true,
        service: "whatsapp",
        status: "running",
        uptime: process.uptime(),
        connected: this.isConnected,
        initialized: this.isInitialized,
      });
    });

    // Get status
    this.app.get("/status", (req, res) => {
      res.json({
        success: true,
        status: {
          connected: this.isConnected,
          phone_number: this.phoneNumber,
          initialized: this.isInitialized,
          qr_code: this.currentQR,
        },
      });
    });

    // Connect (initialize if not already)
    this.app.post("/connect", async (req, res) => {
      try {
        if (this.isConnected) {
          return res.json({
            success: true,
            message: "Already connected",
            connected: true,
            phone_number: this.phoneNumber,
          });
        }

        if (!this.isInitialized) {
          await this.initializeClient();
        }

        res.json({
          success: true,
          message: this.currentQR
            ? "QR code ready for scanning"
            : "Initializing connection...",
          qr_code: this.currentQR,
          connected: this.isConnected,
        });
      } catch (error) {
        console.error("Error in connect endpoint:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Disconnect
    this.app.post("/disconnect", async (req, res) => {
      try {
        await this.disconnect();
        res.json({
          success: true,
          message: "Disconnected successfully",
        });
      } catch (error) {
        console.error("Error in disconnect endpoint:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Send message
    this.app.post("/send", async (req, res) => {
      try {
        const { phone_number, message } = req.body;

        if (!phone_number || !message) {
          return res.status(400).json({
            success: false,
            message: "Phone number and message are required",
          });
        }

        if (!this.isConnected) {
          return res.status(400).json({
            success: false,
            message: "WhatsApp not connected",
          });
        }

        const result = await this.sendMessage(phone_number, message);
        res.json(result);
      } catch (error) {
        console.error("Error in send endpoint:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });
  }

  async start() {
    try {
      // Start HTTP server
      this.server = this.app.listen(this.port, "0.0.0.0", () => {
        console.log(`WhatsApp Service listening on port ${this.port}`);
      });

      // Initialize WhatsApp client automatically
      await this.initializeClient();

      console.log("WhatsApp Service started successfully");
    } catch (error) {
      console.error("Failed to start WhatsApp Service:", error);
      this.scheduleRestart();
    }
  }

  async initializeClient() {
    if (this.isInitialized) {
      console.log("Client already initialized");
      return;
    }

    try {
      console.log("Initializing WhatsApp client...");

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
        },
      });

      this.setupEventHandlers();

      // Initialize the client
      await this.client.initialize();
      this.isInitialized = true;
      this.restartAttempts = 0; // Reset restart attempts on successful init

      console.log("WhatsApp client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize WhatsApp client:", error);
      this.isInitialized = false;
      this.scheduleRestart();
    }
  }

  setupEventHandlers() {
    this.client.on("qr", (qr) => {
      console.log("QR code received");
      this.generateQRCode(qr);
    });

    this.client.on("ready", () => {
      console.log("WhatsApp client is ready!");
      this.isConnected = true;
      this.currentQR = null;

      // Get phone number
      if (this.client.info && this.client.info.wid) {
        this.phoneNumber = this.client.info.wid.user;
        console.log(`Connected as: ${this.phoneNumber}`);
      } else {
        // In some cases, wid is available shortly after ready
        this.trySetPhoneNumber();
      }
    });

    this.client.on("authenticated", () => {
      console.log("WhatsApp client authenticated!");
      // Mark as connected on authentication to avoid stuck status if 'ready' delays
      this.isConnected = true;
      this.currentQR = null;
      // Try to populate phone number if available (multi-device safe)
      this.trySetPhoneNumber();
    });

    this.client.on("auth_failure", (msg) => {
      console.error("Authentication failed:", msg);
      this.isConnected = false;
      this.currentQR = null;
      this.phoneNumber = null;

      // Clear session data on auth failure
      this.clearSessionData();
      this.scheduleRestart();
    });

    this.client.on("disconnected", (reason) => {
      console.error("WhatsApp client disconnected:", reason);
      this.isConnected = false;
      this.currentQR = null;
      this.phoneNumber = null;
      this.isInitialized = false;

      // Schedule restart after disconnection
      this.scheduleRestart();
    });

    // Handle errors
    this.client.on("error", (error) => {
      console.error("WhatsApp client error:", error);
      // Don't restart on every error, just log it
    });

    // Track state changes to ensure isConnected reflects reality across versions
    this.client.on("change_state", (state) => {
      console.log("WhatsApp client state:", state);
      if (state === "CONNECTED") {
        this.isConnected = true;
        // Attempt to set phone number if still missing
        if (!this.phoneNumber) this.trySetPhoneNumber();
      }
    });
  }

  async trySetPhoneNumber(retries = 5, waitMs = 1000) {
    try {
      for (let i = 0; i < retries; i++) {
        const num = this.client?.info?.wid?.user;
        if (num) {
          this.phoneNumber = num;
          console.log(`Connected as: ${this.phoneNumber}`);
          return;
        }
        await new Promise((r) => setTimeout(r, waitMs));
      }
      console.warn("Phone number not available yet (wid.user missing)");
    } catch (e) {
      console.warn("Error while retrieving phone number:", e?.message || e);
    }
  }

  generateQRCode(qr) {
    const QRCode = require("qrcode");

    QRCode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error("Error generating QR code:", err);
        this.currentQR = null;
      } else {
        console.log("QR code generated successfully");
        this.currentQR = url;
      }
    });
  }

  async sendMessage(phoneNumber, message) {
    try {
      if (!this.isConnected) {
        throw new Error("WhatsApp not connected");
      }

      // Format phone number properly
      let formattedNumber = String(phoneNumber || "").replace(/[^\d+]/g, "");
      // Remove leading + for resolution step
      if (formattedNumber.startsWith("+")) {
        formattedNumber = formattedNumber.slice(1);
      }

      console.log(
        `Processing phone number: ${phoneNumber} -> ${formattedNumber} (length: ${formattedNumber.length})`,
      );

      // Handle Egyptian numbers specifically
      if (formattedNumber.startsWith("201") && formattedNumber.length === 12) {
        // Already in correct format: 201XXXXXXXXX (12 digits total)
        // Keep as is
      } else if (
        formattedNumber.startsWith("20") &&
        formattedNumber.length === 11
      ) {
        // Format: 20XXXXXXXXX - this shouldn't happen for valid Egyptian numbers
        // But handle it anyway
        formattedNumber = "201" + formattedNumber.substring(2);
      } else if (
        formattedNumber.startsWith("01") &&
        formattedNumber.length === 11
      ) {
        // Format: 01XXXXXXXXX - replace with 201
        formattedNumber = "201" + formattedNumber.substring(2);
      } else if (
        formattedNumber.startsWith("1") &&
        formattedNumber.length === 10
      ) {
        // Format: 1XXXXXXXXX - add 20
        formattedNumber = "20" + formattedNumber;
      } else if (formattedNumber.length === 9) {
        // Format: XXXXXXXXX - add 201
        formattedNumber = "201" + formattedNumber;
      } else {
        // Log unhandled cases for debugging
        console.log(
          `Unhandled phone number format: ${formattedNumber} (length: ${formattedNumber.length})`,
        );
      }

      // Resolve number to a valid WhatsApp ID using official API (more robust across versions)
      const numberId = await this.client.getNumberId(formattedNumber);
      if (!numberId) {
        throw new Error("Phone number is not registered on WhatsApp");
      }

      const chatId = numberId._serialized || `${formattedNumber}@c.us`;

      console.log(`Sending message to ${chatId}: ${message}`);
      await this.client.sendMessage(chatId, message);

      return {
        success: true,
        message: "Message sent successfully",
      };
    } catch (error) {
      console.error("Error sending message:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async disconnect() {
    try {
      this.isConnected = false;
      this.currentQR = null;
      this.phoneNumber = null;

      if (this.client) {
        await this.client.logout();
        await this.client.destroy();
      }

      this.isInitialized = false;
      this.client = null;

      console.log("WhatsApp client disconnected successfully");
    } catch (error) {
      console.error("Error disconnecting WhatsApp client:", error);
      throw error;
    }
  }

  clearSessionData() {
    try {
      const authDir = path.join(this.sessionPath, ".wwebjs_auth");
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log("Cleared session data");
      }
    } catch (error) {
      console.error("Error clearing session data:", error);
    }
  }

  scheduleRestart() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(
        `Max restart attempts (${this.maxRestartAttempts}) reached. Service will remain available for manual restart.`,
      );
      return;
    }

    this.restartAttempts++;
    const delay = this.restartDelay * this.restartAttempts; // Exponential backoff

    console.log(
      `Scheduling restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`,
    );

    setTimeout(async () => {
      try {
        // Clean up current client
        if (this.client) {
          try {
            await this.client.destroy();
          } catch (error) {
            console.error("Error destroying client during restart:", error);
          }
        }

        this.client = null;
        this.isInitialized = false;
        this.isConnected = false;
        this.currentQR = null;
        this.phoneNumber = null;

        // Reinitialize
        await this.initializeClient();
      } catch (error) {
        console.error("Error during restart:", error);
        this.scheduleRestart();
      }
    }, delay);
  }

  // Graceful shutdown
  async shutdown() {
    console.log("Shutting down WhatsApp Service...");

    try {
      if (this.server) {
        this.server.close();
      }

      await this.disconnect();
      console.log("WhatsApp Service shut down successfully");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }

    process.exit(0);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  if (global.whatsappService) {
    await global.whatsappService.shutdown();
  }
});

process.on("SIGINT", async () => {
  if (global.whatsappService) {
    await global.whatsappService.shutdown();
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Don't exit, just log the error
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit, just log the error
});

// Start the service
console.log("Starting WhatsApp Service...");
global.whatsappService = new WhatsAppService();
