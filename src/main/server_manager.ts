import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import tree from "tree-kill";

export class ServerManager {
  private serverProcess: ChildProcess | null = null;

  startServer(): void {
    if (this.serverProcess) return;

    const serverPath = `${app.getPath("exe")}\\..\\resources\\server\\start_server.bat`;
    this.serverProcess = spawn("cmd.exe", ["/c", serverPath], {
      detached: false,
      windowsHide: true,
    });

    this.serverProcess.on("error", (err) => {
      console.error("Failed to start server:", err);
    });
  }

  stopServer(): void {
    if (
      this.serverProcess &&
      !this.serverProcess.killed &&
      this.serverProcess.pid
    ) {
      // Kill entire process tree
      tree(this.serverProcess.pid);
      this.serverProcess = null;
    }
  }
}
