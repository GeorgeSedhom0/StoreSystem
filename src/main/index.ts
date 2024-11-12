import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { ServerManager } from "./server_manager";

function createChildWindow(url: string): void {
  const childWindow = new BrowserWindow({
    width: 900,
    height: 670,
    parent: BrowserWindow.getFocusedWindow() || undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  childWindow.maximize();

  childWindow.loadURL(url);

  childWindow.setAutoHideMenuBar(true);
  childWindow.setMenuBarVisibility(false);
}

let serverManager: ServerManager;

function createWindow(): void {
  // Run the server before creating the window
  serverManager = new ServerManager();
  serverManager.startServer();

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", async () => {
    // Check that localhost:8000 aka the server is running before showing the window
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Check if URL is external (you can customize this check)
    if (
      details.url.startsWith("http://localhost:5173") ||
      details.url.startsWith("https://localhost:5173")
    ) {
      // For external URLs, open in new Electron window
      createChildWindow(details.url);
      return { action: "deny" };
    }
    // For other cases, deny and let the app handle it
    return { action: "deny" };
  });

  ipcMain.handle(
    "print",
    async (
      _event,
      { html, options },
    ): Promise<{ success: boolean; error?: string } | void> => {
      const { deviceName, printBackground, width, copies } = options;
      let win: BrowserWindow | null = null;
      try {
        win = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
          },
        });

        await win.loadFile("print-template.html");

        await win.webContents.executeJavaScript(`
          document.body.innerHTML = \`${html}\`;
        `);

        // get hight of the content
        const height = await win.webContents.executeJavaScript(`
        document.body.scrollHeight
      `);

        win.webContents.print(
          {
            silent: true,
            printBackground: printBackground,
            deviceName,
            margins: {
              marginType: "custom",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            },
            pageSize: {
              width: width * 1000, // convert to microns
              height: height * 1000, // convert to microns
            },
            copies,
          },
          (success, errorType) => {
            if (!success) {
              console.error("Printing failed:", errorType);
              return { success: false, error: errorType };
            } else {
              console.log("Printed successfully");
              return { success: true };
            }
          },
        );
      } catch (error) {
        console.error("Printing failed:", error);
        return { success: false, error: error as string };
      }
    },
  );

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  console.log("Window all closed");
  serverManager.stopServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  console.log("Before quit");
  serverManager.stopServer();
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
