import { app } from "electron";
import { join } from "path";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { is } from "@electron-toolkit/utils";

export class SettingsManager {
  private settingsPath: string;
  private printerSettingsPath: string;

  constructor() {
    let userDataPath: string;
    if (is.dev) {
      userDataPath = process.cwd();
    } else {
      userDataPath = app.getPath("appData");
    }

    const settingsDir = join(userDataPath, "settings");

    // Ensure settings directory exists
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true });
    }

    this.settingsPath = join(settingsDir, "settings.json");
    this.printerSettingsPath = join(settingsDir, "printer_settings.json");

    // Initialize settings files if they don't exist
    if (!existsSync(this.settingsPath)) {
      this.writeSettings({});
    }
    if (!existsSync(this.printerSettingsPath)) {
      this.writePrinterSettings({});
    }
  }

  readSettings(): any {
    try {
      return JSON.parse(readFileSync(this.settingsPath, "utf-8"));
    } catch (error) {
      console.error("Error reading settings:", error);
      return {};
    }
  }

  writeSettings(settings: any): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  setSetting(key: string, value: any): void {
    const settings = this.readSettings();
    settings[key] = value;
    this.writeSettings(settings);
  }

  getSetting(key: string): any {
    const settings = this.readSettings();
    return settings[key];
  }

  readPrinterSettings(): any {
    try {
      return JSON.parse(readFileSync(this.printerSettingsPath, "utf-8"));
    } catch (error) {
      console.error("Error reading printer settings:", error);
      return null;
    }
  }

  writePrinterSettings(settings: any): void {
    writeFileSync(this.printerSettingsPath, JSON.stringify(settings, null, 2));
  }
}

export const settingsManager = new SettingsManager();
