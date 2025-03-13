import { app, dialog } from "electron";
import tree from "tree-kill";
import path from "path";
import { is } from "@electron-toolkit/utils";
import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import { settingsManager } from "./settings_manager";
import axios from "axios";

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverPid: number | null = null;

  constructor() {
    // Check for existing serverPid in settings
    const savedPid = settingsManager.getSetting("serverPid");
    if (savedPid) {
      this.serverPid = savedPid;
    }
  }

  private getServerPath(): string {
    const rootDir = is.dev
      ? process.cwd()
      : path.join(app.getPath("exe"), "..");

    const sslPath = path.join(rootDir, "server", "localhost.pem");
    const serverFile = existsSync(sslPath)
      ? "start_server_ssl.bat"
      : "start_server.bat";

    return path.join(rootDir, "server", serverFile);
  }

  async isServerRunning() {
    try {
      // If no server url is set, do the check using pid
      const serverUrl = settingsManager.getSetting("baseUrl");
      if (!serverUrl) {
        return this.serverPid ? true : false;
      }

      const { data } = await axios.get(serverUrl + "/test");
      return data === "Hello, World!";
    } catch (error) {
      return false;
    }
  }

  async startServer() {
    if (this.serverProcess) return;

    const isServerRunning = await this.isServerRunning();
    if (isServerRunning) {
      console.log("Server is already running");
      return;
    }

    try {
      const serverPath = this.getServerPath();
      console.log("Server path:", serverPath);

      // Use cmd.exe with proper path escaping
      this.serverProcess = spawn("cmd.exe", ["/c", `"${serverPath}"`], {
        windowsHide: true,
        cwd: path.dirname(serverPath),
        shell: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      this.serverPid = this.serverProcess.pid || null;

      this.serverProcess.on("error", (err) => {
        console.error("Failed to start server:", err);
      });

      this.serverProcess.stdout?.on("data", (data) => {
        console.log(`Server stdout: ${data}`);
      });

      this.serverProcess.stderr?.on("data", (data) => {
        console.error(`Server stderr: ${data}`);
      });

      if (this.serverPid) {
        // Save the serverPid using settings manager
        settingsManager.setSetting("serverPid", this.serverPid);
      }

      let tries = 0;
      while (!(await this.isServerRunning()) && tries < 10) {
        tries++;
        console.log("Waiting for server to start...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error("Error spawning server process:", error);
      // show dialog with error message
      dialog.showErrorBox(
        "Application Error",
        `Failed to start the server. The application will now quit.
          ${error}`,
      );
    }
  }

  async stopServer() {
    if (this.serverPid) {
      try {
        // Use tree-kill to kill the entire process tree
        tree(this.serverPid, "SIGTERM", (err) => {
          if (err) {
            console.error("Failed to kill server process:", err);
          } else {
            console.log("Server process killed successfully");
          }
        });
      } catch (error) {
        console.error("Error stopping server:", error);
      }
      // Remove the serverPid from settings
      settingsManager.setSetting("serverPid", null);
    } else {
      console.log("Server PID not found");
    }
  }
}
