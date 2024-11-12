import { app } from "electron";
import tree from "tree-kill";
import path from "path";
import { is } from "@electron-toolkit/utils";
import { existsSync } from "fs";
import { ChildProcess, spawn } from "child_process";

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverPid: number | null = null;

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

  startServer(): void {
    if (this.serverProcess) return;

    const serverPath = this.getServerPath();
    console.log("Server path:", serverPath);

    const serverDir = path.dirname(serverPath);

    this.serverProcess = spawn("cmd.exe", ["/c", serverPath], {
      detached: true, // Change to true to create process group
      windowsHide: true,
      cwd: serverDir,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    this.serverPid = this.serverProcess.pid || null;

    this.serverProcess.stdout?.on("data", (data) => {
      console.log(`Server stdout: ${data}`);
    });

    this.serverProcess.stderr?.on("data", (data) => {
      console.error(`Server stderr: ${data}`);
    });
  }

  stopServer(): void {
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
    }

    this.serverProcess = null;
    this.serverPid = null;
  }
}
