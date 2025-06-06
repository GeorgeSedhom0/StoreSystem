import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { settingsManager } from "./settings_manager";

// Track window IDs
const windowRegistry = new Map<number, BrowserWindow>();

// Function to find the smallest available window ID
function getNextAvailableWindowId(): number {
  // If registry is empty, start with 1
  if (windowRegistry.size === 0) {
    return 1;
  }

  // Get all current window IDs
  const usedIds = Array.from(windowRegistry.keys()).sort((a, b) => a - b);

  // Find the first gap in the sequence or the next number after the largest
  let nextId = 1;
  for (const id of usedIds) {
    if (id > nextId) {
      // Found a gap
      break;
    }
    nextId = id + 1;
  }

  return nextId;
}

function createChildWindow(url: string): void {
  // Get the next available window ID
  const windowId = getNextAvailableWindowId();

  const childWindow = new BrowserWindow({
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
  // Register window with its ID
  windowRegistry.set(windowId, childWindow);
  console.log(
    `Created child window with ID: ${windowId}, active windows: ${Array.from(windowRegistry.keys())}`,
  );

  // Remove from registry when closed
  childWindow.on("closed", () => {
    console.log(
      `Closing window ID: ${windowId}, before removal active windows: ${Array.from(windowRegistry.keys())}`,
    );
    windowRegistry.delete(windowId);
    console.log(
      `After removal active windows: ${Array.from(windowRegistry.keys())}`,
    );
  });

  childWindow.webContents.session.setCertificateVerifyProc(
    (_request, callback) => {
      callback(0);
    },
  );

  childWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") {
      childWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "F5") {
      childWindow.reload();
      event.preventDefault();
    }
  });

  childWindow.setAutoHideMenuBar(true);
  childWindow.setMenuBarVisibility(false);
  childWindow.maximize();
  childWindow.loadURL(url + `?windowId=${windowId}`);
  childWindow.show();
  childWindow.focus();
}

app.commandLine.appendSwitch("ignore-certificate-errors", "true");

function createWindow(): void {
  try {
    // Get ID for the main window (should be 1 if it's the first window)
    const windowId = getNextAvailableWindowId();

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
    }); // Register main window with its ID
    windowRegistry.set(windowId, mainWindow);
    console.log(
      `Created main window with ID: ${windowId}, active windows: ${Array.from(windowRegistry.keys())}`,
    );

    // Remove from registry when closed
    mainWindow.on("closed", () => {
      console.log(
        `Closing main window ID: ${windowId}, before removal active windows: ${Array.from(windowRegistry.keys())}`,
      );
      windowRegistry.delete(windowId);
      console.log(
        `After removal active windows: ${Array.from(windowRegistry.keys())}`,
      );
    });

    mainWindow.webContents.session.setCertificateVerifyProc(
      (_request, callback) => {
        callback(0);
      },
    );

    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12") {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
      if (input.key === "F5") {
        mainWindow.reload();
        event.preventDefault();
      }
    });

    mainWindow.on("ready-to-show", async () => {
      // Check that localhost:8000 aka the server is running before showing the window
      mainWindow.maximize();
      mainWindow.show();
    });

    ipcMain.handle("open-new-window", (_event, path = "") => {
      const url =
        is.dev && process.env["ELECTRON_RENDERER_URL"]
          ? process.env["ELECTRON_RENDERER_URL"]
          : `file://${join(__dirname, "../renderer/index.html")}`;
      createChildWindow(url + path);
    }); // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      mainWindow.loadURL(
        `${process.env["ELECTRON_RENDERER_URL"]}?windowId=${windowId}`,
      );
    } else {
      mainWindow.loadFile(join(__dirname, "../renderer/index.html"), {
        query: { windowId: windowId.toString() },
      });
    }
  } catch (e) {
    dialog.showErrorBox(
      "Application Error",
      `Failed to start the server. The application will now quit ${e}`,
    );
    app.quit();
    return;
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

app.on(
  "certificate-error",
  (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true); // Trust the certificate
  },
);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  console.log("Window all closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  console.log("Before quit");
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

function getPrinters() {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  return mainWindow.webContents.getPrintersAsync();
}

function savePrinterSettings(printerSettings) {
  settingsManager.writePrinterSettings(printerSettings);
}

function getPrinterSettings() {
  return settingsManager.readPrinterSettings();
}

const getPrinterConfig = async (type: "bill" | "barcode") => {
  const settings = await getPrinterSettings();
  if (!settings) throw new Error("Printer settings not found");

  return {
    deviceName:
      type === "bill" ? settings.billPrinter : settings.barcodePrinter,
    width:
      type === "bill"
        ? Number(settings.billPrinterWidth) || 80
        : Number(settings.barcodePrinterWidth) || 40,
    height:
      type === "bill"
        ? Number(settings.billPrinterHeight) || undefined
        : Number(settings.barcodePrinterHeight) || undefined,
  };
};

const createPrintWindow = async (html: string, config: any) => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true },
  });
  await win.loadFile("print-template.html");
  await win.webContents.executeJavaScript(
    `document.body.innerHTML = \`${html}\`;`,
  );

  const height =
    config.height ||
    (await win.webContents.executeJavaScript(`
    document.body.scrollHeight
  `));

  return { win, height };
};

ipcMain.handle("print", async (_event, { html, type, copies }) => {
  try {
    const config = await getPrinterConfig(type);
    const { win, height } = await createPrintWindow(html, config);

    return new Promise((resolve) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: config.deviceName,
          margins: { marginType: "none" },
          pageSize: {
            width: config.width * 1000,
            height: config.height ? config.height * 1000 : height * 1000,
          },
          copies: copies || 1,
        },
        (success, error) => {
          win.close();
          if (!success) {
            dialog.showErrorBox(
              "Print Error",
              `Failed to print: ${error || "Unknown error"}`,
            );
          }
          resolve({ success, error: error || undefined });
        },
      );
    });
  } catch (error) {
    dialog.showErrorBox("Print Error", `Print operation failed: ${error}`);
    return { success: false, error: error };
  }
});

ipcMain.handle("getPrinters", async () => {
  return getPrinters();
});

ipcMain.handle("savePrinterSettings", (_event, printerSettings) => {
  savePrinterSettings(printerSettings);
});

ipcMain.handle("getPrinterSettings", () => {
  return getPrinterSettings();
});

ipcMain.handle("set", (_event, key, value) => {
  settingsManager.setSetting(key, value);
});

ipcMain.handle("get", (_event, key) => {
  return settingsManager.getSetting(key);
});

ipcMain.handle("get-cart", (_event, page: string, windowId: number) => {
  return settingsManager.getSetting(`cart-${page}-window-${windowId}`) || [];
});

ipcMain.handle(
  "set-cart",
  (_event, page: string, windowId: number, cart: any) => {
    settingsManager.setSetting(`cart-${page}-window-${windowId}`, cart);
  },
);

// Add a way to get the window ID from the renderer
ipcMain.handle("get-window-id", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;

  // Find the windowId from the registry
  for (const [id, window] of windowRegistry.entries()) {
    if (window === win) {
      return id;
    }
  }

  return null;
});

// For debugging: get all active window IDs
ipcMain.handle("get-active-window-ids", () => {
  return Array.from(windowRegistry.keys());
});
