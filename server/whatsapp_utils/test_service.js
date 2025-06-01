// Test script for WhatsApp service
const http = require("http");

const makeRequest = (path, method = "GET", data = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3001,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (data && method !== "GET") {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
};

const testService = async () => {
  console.log("Testing WhatsApp Service...\n");

  try {
    // Test health check
    console.log("1. Testing health check...");
    const health = await makeRequest("/health");
    console.log("Health:", health.data);
    console.log("");

    // Test status
    console.log("2. Testing status...");
    const status = await makeRequest("/status");
    console.log("Status:", status.data);
    console.log("");

    // Test connect
    console.log("3. Testing connect...");
    const connect = await makeRequest("/connect", "POST");
    console.log("Connect:", connect.data);
    console.log("");

    console.log("Service tests completed successfully!");
  } catch (error) {
    console.error("Error testing service:", error.message);
  }
};

// Run tests
testService();
