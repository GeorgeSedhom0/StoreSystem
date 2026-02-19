import { app } from "electron";
import { join } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "fs";
import { execFileSync, spawn, ChildProcess, execSync } from "child_process";
import { randomBytes } from "crypto";
import https from "https";
import { is } from "@electron-toolkit/utils";
import net from "net";

// Status reported to the renderer for the splash screen
export type ServiceStatus =
  | "not-started"
  | "starting-db"
  | "initializing-db"
  | "starting-backend"
  | "ready"
  | "error";

export class ServiceManager {
  private dataDir: string;
  private pgDataDir: string;
  private sslDir: string;
  private logsDir: string;
  private envFilePath: string;
  private envVars: Record<string, string> = {};

  private backendProcess: ChildProcess | null = null;
  private pgProcess: ChildProcess | null = null;
  private pgPort = 5432; // Will be auto-picked if 5432 is occupied

  private _status: ServiceStatus = "not-started";
  private _statusMessage = "";
  private statusListeners: Array<
    (status: ServiceStatus, message: string) => void
  > = [];

  // Paths to bundled runtimes
  private pythonExe: string;
  private pgBinDir: string;
  private serverDir: string;

  // Log rotation settings
  private static readonly MAX_LOG_AGE_DAYS = 7;
  private static readonly MAX_LOG_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

  constructor() {
    // Data directory in Local AppData (persists across updates, not affected
    // by roaming profile sync which can wipe files)
    if (is.dev) {
      this.dataDir = join(process.cwd(), "openstore-data");
    } else {
      const localAppData = process.env.LOCALAPPDATA || app.getPath("appData");
      this.dataDir = join(localAppData, "OpenStore");
    }

    this.pgDataDir = join(this.dataDir, "pgdata");
    this.sslDir = join(this.dataDir, "ssl");
    this.logsDir = join(this.dataDir, "logs");
    this.envFilePath = join(this.dataDir, ".env");

    // Bundled runtime paths (in app resources)
    const resourcesPath = is.dev
      ? join(process.cwd(), "backend-dist")
      : join(process.resourcesPath, "backend");

    this.pythonExe = join(resourcesPath, "python", "python.exe");
    this.pgBinDir = join(resourcesPath, "pgsql", "bin");
    this.serverDir = join(resourcesPath, "server");
  }

  get status(): ServiceStatus {
    return this._status;
  }

  get statusMessage(): string {
    return this._statusMessage;
  }

  onStatusChange(
    listener: (status: ServiceStatus, message: string) => void,
  ): void {
    this.statusListeners.push(listener);
  }

  private setStatus(status: ServiceStatus, message = ""): void {
    this._status = status;
    this._statusMessage = message;
    for (const listener of this.statusListeners) {
      listener(status, message);
    }
  }

  // ─── Startup ───────────────────────────────────────────────

  async start(): Promise<void> {
    try {
      // Ensure directories exist
      for (const dir of [this.dataDir, this.sslDir, this.logsDir]) {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      }

      // Clean up old log files
      this.cleanupLogs();

      // Generate .env if first run
      if (!existsSync(this.envFilePath)) {
        this.generateEnvFile();
      }
      this.loadEnvFile();

      // Generate SSL certs if missing
      if (
        !existsSync(join(this.sslDir, "cert.pem")) ||
        !existsSync(join(this.sslDir, "key.pem"))
      ) {
        this.generateSslCerts();
      }

      // Find an available port for PostgreSQL
      this.pgPort = await this.findAvailablePort(5432);
      console.log(`Using PostgreSQL port: ${this.pgPort}`);

      // Start PostgreSQL
      this.setStatus("starting-db", "جاري تشغيل قاعدة البيانات...");
      const isFirstRun = !existsSync(join(this.pgDataDir, "PG_VERSION"));
      if (isFirstRun) {
        this.setStatus("initializing-db", "جاري إعداد قاعدة البيانات...");
        await this.initPostgres();
      } else {
        // Update port in postgresql.conf if it changed
        this.updatePostgresPort();
      }
      await this.startPostgres();
      await this.waitForPostgres();

      // On first run, create the database and run init.py
      if (isFirstRun) {
        this.setStatus("initializing-db", "جاري إنشاء الجداول...");
        await this.initializeDatabase();
      } else {
        // Run pending database migrations for existing installs
        await this.runMigrations();
      }

      // Start FastAPI backend
      this.setStatus("starting-backend", "جاري تشغيل السيرفر...");
      await this.startBackend();
      await this.waitForBackend();

      this.setStatus("ready", "جاهز");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("ServiceManager startup failed:", msg);
      this.setStatus("error", msg);
      throw err;
    }
  }

  // ─── Shutdown ──────────────────────────────────────────────

  async shutdown(): Promise<void> {
    console.log("ServiceManager shutting down...");

    // Stop backend
    if (this.backendProcess && !this.backendProcess.killed) {
      this.backendProcess.kill("SIGTERM");
      await this.waitForProcessExit(this.backendProcess, 5000);
      if (!this.backendProcess.killed) {
        this.backendProcess.kill("SIGKILL");
      }
      this.backendProcess = null;
    }

    // Stop PostgreSQL gracefully using pg_ctl stop (sends proper shutdown signal)
    try {
      const pgCtl = join(this.pgBinDir, "pg_ctl.exe");
      execFileSync(pgCtl, ["stop", "-D", this.pgDataDir, "-m", "fast"], {
        timeout: 10000,
        windowsHide: true,
        stdio: "pipe",
      });
    } catch (e) {
      // If pg_ctl stop fails, kill the process directly
      if (this.pgProcess && !this.pgProcess.killed) {
        this.pgProcess.kill("SIGTERM");
        await this.waitForProcessExit(this.pgProcess, 3000);
        if (!this.pgProcess.killed) {
          this.pgProcess.kill("SIGKILL");
        }
      }
      console.warn("pg_ctl stop failed, killed process directly:", e);
    }
    this.pgProcess = null;

    console.log("ServiceManager shutdown complete");
  }

  // ─── Environment ───────────────────────────────────────────

  private generateEnvFile(): void {
    const dbPass = randomBytes(16).toString("hex");
    const jwtSecret = randomBytes(32).toString("hex");

    // Find the highest available update_db_*.py number to set as initial db_version
    // since init.py is always up to date and includes all changes
    const highestMigration = this.getHighestMigrationNumber();

    const env = [
      `HOST=127.0.0.1`,
      `USER=openstore`,
      `PASS=${dbPass}`,
      `DATABASE=openstore`,
      `SECRET=${jwtSecret}`,
      `ALGORITHM=HS256`,
      `TELEGRAM_BOT_TOKEN=`,
      `TZ=Africa/Cairo`,
      `PGTZ=Africa/Cairo`,
      `DB_VERSION=${highestMigration}`,
    ].join("\n");

    writeFileSync(this.envFilePath, env, "utf-8");
    console.log(
      `Generated .env file at ${this.envFilePath} (db_version=${highestMigration})`,
    );
  }

  private loadEnvFile(): void {
    const content = readFileSync(this.envFilePath, "utf-8");
    this.envVars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      this.envVars[key] = value;
    }
  }

  getEnvVar(key: string): string {
    return this.envVars[key] || "";
  }

  setEnvVar(key: string, value: string): void {
    this.envVars[key] = value;
    // Write back to file
    const lines = Object.entries(this.envVars).map(([k, v]) => `${k}=${v}`);
    writeFileSync(this.envFilePath, lines.join("\n"), "utf-8");
  }

  // ─── SSL ───────────────────────────────────────────────────

  private generateSslCerts(): void {
    console.log("Generating self-signed SSL certificates...");

    const certPath = join(this.sslDir, "cert.pem");
    const keyPath = join(this.sslDir, "key.pem");

    // Try openssl (ships with Git for Windows, commonly available)
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 36500 -nodes -subj "/CN=localhost"`,
        { timeout: 15000, stdio: "pipe" },
      );
      console.log("SSL certificates generated via openssl");
      return;
    } catch {
      console.warn("openssl not found, trying Python fallback...");
    }

    // Fallback: use Python's ssl module to generate a self-signed cert
    const script = `
import subprocess, sys, os
cert_file = r'${certPath.replace(/\\/g, "\\\\")}'
key_file = r'${keyPath.replace(/\\/g, "\\\\")}'

# Install cryptography into embedded Python if not present
try:
    from cryptography import x509
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'cryptography', '--quiet'])
    from cryptography import x509

from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime, ipaddress

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, u"localhost")])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=36500))
    .add_extension(
        x509.SubjectAlternativeName([x509.DNSName(u"localhost"), x509.IPAddress(ipaddress.IPv4Address("127.0.0.1"))]),
        critical=False,
    )
    .sign(key, hashes.SHA256())
)

with open(key_file, "wb") as f:
    f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))
with open(cert_file, "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))
print("SSL certificates generated")
`;

    try {
      execFileSync(this.pythonExe, ["-c", script], {
        timeout: 60000,
        stdio: "pipe",
      });
      console.log("SSL certificates generated via Python");
    } catch (e) {
      throw new Error(
        `Could not generate SSL certificates: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ─── PostgreSQL ────────────────────────────────────────────

  private async initPostgres(): Promise<void> {
    console.log("Initializing PostgreSQL data directory...");

    const initdb = join(this.pgBinDir, "initdb.exe");
    const pwFile = join(this.dataDir, ".pgpass");

    // Write password file for initdb
    writeFileSync(pwFile, this.envVars["PASS"] || "openstore", "utf-8");

    try {
      execFileSync(
        initdb,
        [
          "-D",
          this.pgDataDir,
          "-U",
          this.envVars["USER"] || "openstore",
          "-A",
          "password",
          `--pwfile=${pwFile}`,
          "-E",
          "UTF8",
          "--locale=C",
        ],
        { timeout: 60000, stdio: "pipe", windowsHide: true },
      );
      console.log("PostgreSQL data directory initialized");
    } finally {
      // Remove password file
      if (existsSync(pwFile)) unlinkSync(pwFile);
    }

    // Configure postgresql.conf for localhost-only access
    const pgConf = join(this.pgDataDir, "postgresql.conf");
    let conf = readFileSync(pgConf, "utf-8");
    conf += "\n# OpenStore configuration\n";
    conf += "listen_addresses = '127.0.0.1'\n";
    conf += `port = ${this.pgPort}\n`;
    conf += "timezone = 'Africa/Cairo'\n";
    conf += "log_timezone = 'Africa/Cairo'\n";
    writeFileSync(pgConf, conf, "utf-8");
  }

  /** Update the port in postgresql.conf if port changed (e.g. conflict detected) */
  private updatePostgresPort(): void {
    const pgConf = join(this.pgDataDir, "postgresql.conf");
    if (!existsSync(pgConf)) return;

    let conf = readFileSync(pgConf, "utf-8");
    // Replace existing port line
    conf = conf.replace(/^port\s*=\s*\d+/m, `port = ${this.pgPort}`);
    writeFileSync(pgConf, conf, "utf-8");
  }

  private async startPostgres(): Promise<void> {
    console.log("Starting PostgreSQL...");

    const postgresExe = join(this.pgBinDir, "postgres.exe");
    const logFile = join(this.logsDir, "postgresql.log");
    const { createWriteStream: fsCreateWriteStream } = require("fs");
    const pgLogStream = fsCreateWriteStream(logFile, { flags: "a" });

    // Spawn postgres.exe directly instead of pg_ctl — this lets Node control
    // window creation via windowsHide, preventing the visible CMD window that
    // users would close and break the app.
    this.pgProcess = spawn(postgresExe, ["-D", this.pgDataDir], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.pgProcess.stdout?.pipe(pgLogStream);
    this.pgProcess.stderr?.pipe(pgLogStream);

    this.pgProcess.on("exit", (code) => {
      console.log(`PostgreSQL process exited with code ${code}`);
    });

    console.log("PostgreSQL starting (pid:", this.pgProcess.pid, ")");
  }

  private async waitForPostgres(
    retries = 30,
    intervalMs = 1000,
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      const isUp = await this.checkPort(this.pgPort);
      if (isUp) {
        console.log(
          `PostgreSQL is accepting connections on port ${this.pgPort}`,
        );
        return;
      }
      await this.sleep(intervalMs);
    }
    throw new Error(
      `PostgreSQL failed to start on port ${this.pgPort} within the expected time`,
    );
  }

  private async initializeDatabase(): Promise<void> {
    console.log("Running database initialization (init.py)...");

    // First create the database (initdb creates a default postgres db, not our app db)
    const psql = join(this.pgBinDir, "psql.exe");
    const dbName = this.envVars["DATABASE"] || "openstore";
    const dbUser = this.envVars["USER"] || "openstore";

    try {
      execFileSync(
        psql,
        [
          "-h",
          "127.0.0.1",
          "-p",
          String(this.pgPort),
          "-U",
          dbUser,
          "-d",
          "postgres",
          "-c",
          `CREATE DATABASE ${dbName};`,
        ],
        {
          timeout: 15000,
          stdio: "pipe",
          windowsHide: true,
          env: {
            ...process.env,
            PGPASSWORD: this.envVars["PASS"] || "openstore",
          },
        },
      );
    } catch (e) {
      // Database might already exist
      console.warn("Create database warning (may already exist):", e);
    }

    // Build env vars for Python processes — override HOST with port-aware connection
    const pythonEnv = this.buildPythonEnv();

    // Run init.py using the embedded Python
    const initPy = join(this.serverDir, "init.py");
    if (existsSync(initPy)) {
      execFileSync(this.pythonExe, [initPy], {
        cwd: this.serverDir,
        timeout: 60000,
        stdio: "pipe",
        env: pythonEnv,
      });
      console.log("Database initialization complete");
    } else {
      console.warn("init.py not found at", initPy);
    }
  }

  // ─── Database Migrations ──────────────────────────────────

  /** Get the highest update_db_N.py number from the server directory */
  private getHighestMigrationNumber(): number {
    if (!existsSync(this.serverDir)) return 0;

    const files = readdirSync(this.serverDir);
    let highest = 0;
    for (const file of files) {
      const match = file.match(/^update_db_(\d+)\.py$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highest) highest = num;
      }
    }
    return highest;
  }

  /** Run any pending database migrations (update_db_*.py files) */
  private async runMigrations(): Promise<void> {
    const currentVersion = parseInt(this.envVars["DB_VERSION"] || "0", 10);
    const highestAvailable = this.getHighestMigrationNumber();

    if (currentVersion >= highestAvailable) {
      console.log(
        `Database is up to date (version ${currentVersion}, highest available: ${highestAvailable})`,
      );
      return;
    }

    console.log(
      `Running migrations from version ${currentVersion} to ${highestAvailable}...`,
    );

    const pythonEnv = this.buildPythonEnv();

    // Collect and sort migration files that need to run
    const files = readdirSync(this.serverDir);
    const pendingMigrations: { num: number; file: string }[] = [];

    for (const file of files) {
      const match = file.match(/^update_db_(\d+)\.py$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > currentVersion) {
          pendingMigrations.push({ num, file });
        }
      }
    }

    // Sort by migration number ascending
    pendingMigrations.sort((a, b) => a.num - b.num);

    for (const migration of pendingMigrations) {
      const migrationPath = join(this.serverDir, migration.file);
      console.log(`Running migration: ${migration.file}...`);

      try {
        execFileSync(this.pythonExe, [migrationPath], {
          cwd: this.serverDir,
          timeout: 120000,
          stdio: "pipe",
          env: pythonEnv,
        });

        // Update db_version after each successful migration
        this.setEnvVar("DB_VERSION", String(migration.num));
        console.log(
          `Migration ${migration.file} completed. DB version: ${migration.num}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Migration ${migration.file} failed: ${msg}`);
        throw new Error(`Database migration ${migration.file} failed: ${msg}`);
      }
    }

    console.log(`All migrations complete. DB version: ${highestAvailable}`);
  }

  /** Build environment variables for Python child processes */
  private buildPythonEnv(): Record<string, string> {
    return {
      ...process.env,
      ...this.envVars,
      // Override HOST to include port if non-default
      // psycopg2 uses HOST for connection — but port is separate,
      // so we pass PGPORT for tools that use it
      PGPORT: String(this.pgPort),
      PATH: `${this.pgBinDir};${process.env.PATH || ""}`,
    };
  }

  // ─── Backend ───────────────────────────────────────────────

  private async startBackend(): Promise<void> {
    console.log("Starting FastAPI backend...");

    const backendLogFile = join(this.logsDir, "backend.log");
    const { createWriteStream } = require("fs");
    const logStream = createWriteStream(backendLogFile, { flags: "a" });

    const pythonEnv = this.buildPythonEnv();

    this.backendProcess = spawn(
      this.pythonExe,
      [
        "-m",
        "uvicorn",
        "main_wrapper:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--ssl-keyfile",
        join(this.sslDir, "key.pem"),
        "--ssl-certfile",
        join(this.sslDir, "cert.pem"),
      ],
      {
        cwd: this.serverDir,
        env: pythonEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    this.backendProcess.stdout?.pipe(logStream);
    this.backendProcess.stderr?.pipe(logStream);

    this.backendProcess.on("exit", (code) => {
      console.log(`Backend process exited with code ${code}`);
    });
  }

  private async waitForBackend(retries = 60, intervalMs = 1000): Promise<void> {
    // Create an HTTPS agent that ignores self-signed cert errors
    const agent = new https.Agent({ rejectUnauthorized: false });

    for (let i = 0; i < retries; i++) {
      try {
        const result = await new Promise<boolean>((resolve) => {
          const req = https.get(
            "https://127.0.0.1:8000/test",
            { agent, timeout: 3000 },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                resolve(data.includes("Hello, World!"));
              });
            },
          );
          req.on("error", () => resolve(false));
          req.on("timeout", () => {
            req.destroy();
            resolve(false);
          });
        });

        if (result) {
          console.log("Backend is ready");
          return;
        }
      } catch {
        // Retry
      }
      await this.sleep(intervalMs);
    }

    throw new Error("Backend failed to start within the expected time");
  }

  // ─── Log Cleanup ──────────────────────────────────────────

  /** Remove old/oversized log files */
  private cleanupLogs(): void {
    try {
      if (!existsSync(this.logsDir)) return;

      const now = Date.now();
      const maxAge = ServiceManager.MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
      const files = readdirSync(this.logsDir);

      for (const file of files) {
        if (!file.endsWith(".log")) continue;

        const filePath = join(this.logsDir, file);
        try {
          const stats = statSync(filePath);
          const age = now - stats.mtimeMs;

          // Delete logs older than MAX_LOG_AGE_DAYS or larger than MAX_LOG_SIZE_BYTES
          if (age > maxAge || stats.size > ServiceManager.MAX_LOG_SIZE_BYTES) {
            unlinkSync(filePath);
            console.log(`Cleaned up old log: ${file}`);
          }
        } catch {
          // Skip files we can't stat (e.g. locked by another process)
        }
      }
    } catch (e) {
      console.warn("Log cleanup failed (non-fatal):", e);
    }
  }

  // ─── Utilities ─────────────────────────────────────────────

  /** Find an available port starting from the preferred one */
  private async findAvailablePort(preferred: number): Promise<number> {
    for (let port = preferred; port < preferred + 100; port++) {
      const inUse = await this.checkPort(port);
      if (!inUse) {
        return port;
      }
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
    }
    throw new Error(
      `Could not find an available port in range ${preferred}-${preferred + 99}`,
    );
  }

  private checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private waitForProcessExit(
    proc: ChildProcess,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), timeoutMs);
      proc.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
