import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { ServerManager } from "./server_manager";
import { settingsManager } from "./settings_manager";

function createChildWindow(url: string): void {
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

  childWindow.setAutoHideMenuBar(true);
  childWindow.setMenuBarVisibility(false);
  childWindow.maximize();
  childWindow.loadURL(url);
  childWindow.show();
  childWindow.focus();
}

let serverManager: ServerManager;

function createWindow(): void {
  serverManager = new ServerManager();
  try {
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

    ipcMain.handle("open-new-window", (_event, path = "") => {
      const url =
        is.dev && process.env["ELECTRON_RENDERER_URL"]
          ? process.env["ELECTRON_RENDERER_URL"]
          : `file://${join(__dirname, "../renderer/index.html")}`;
      createChildWindow(url + path);
    });

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
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

async function showCopiesDialog() {
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: "question",
    buttons: ["Cancel", "OK"],
    defaultId: 1,
    title: "Number of Copies",
    message: "Please enter the number of copies:",
    checkboxLabel: "Remember my answer",
    checkboxChecked: false,
    input: {
      type: "number",
      placeholder: "Number of copies",
    },
  });

  if (response === 1) {
    return checkboxChecked ? parseInt(checkboxChecked) : 1;
  } else {
    throw new Error("User cancelled the dialog");
  }
}

ipcMain.handle("print", async (_event, { html, type }) => {
  try {
    const config = await getPrinterConfig(type);
    const { win, height } = await createPrintWindow(html, config);

    if (type === "barcode") {
      const copies = await showCopiesDialog();
      config.copies = copies;
    }

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
          copies: config.copies || 1,
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
