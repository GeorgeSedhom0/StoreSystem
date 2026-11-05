"""
Automated database backups.

A background loop runs pg_dump once a day (default 03:00 server time, or as
soon as the backend is running after that time if the PC was off), optionally
also after every shift close, gzip-compresses the plain-SQL dump (the same
format the manual backup / restore page uses), checks it (exit code + the
"dump complete" trailer, so a failed or truncated dump is never kept), writes
it to a persistent folder and sends it to the stores' Telegram chats.

Where backups go (first match wins):
1. The folder set in Settings (dir_override).
2. $BACKUP_DIR (Docker: a mounted host volume, see docker-compose*.yml).
3. Windows (the Electron app): "<Documents>\\OpenStore Backups". The app's own
   data lives in %LOCALAPPDATA%\\OpenStore and is the thing that gets wiped on a
   reset/reinstall; Documents is outside the app, visible to the owner, kept
   on uninstall/update and usually included in the user's own backups/OneDrive.
4. Docker without $BACKUP_DIR: /backups (flagged as non-persistent unless it
   is a mount). Other Linux: ~/OpenStore Backups.

Retention only ever deletes files this module created: the name must match
openstore-<db>-<YYYYMMDD-HHMMSS>-<kind>.sql.gz AND be listed in the folder's
manifest (.openstore-backups.json). Kept: every file from today, the newest
file of each of the last `keep_daily` days and of each of the last
`keep_weekly` ISO weeks, and always the newest file.

Settings and status are JSON rows in db_meta (no schema change).
"""

import asyncio
import gzip
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
from datetime import date, datetime, timedelta
from os import getenv
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import telegram_utils as tu
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

logger = logging.getLogger(__name__)

router = APIRouter(tags=["backup"])

SETTINGS_KEY = "backup_settings"
STATUS_KEY = "backup_status"
MANIFEST_NAME = ".openstore-backups.json"
KINDS = ("daily", "manual", "shift")
KIND_AR = {
    "daily": "تلقائية يومية",
    "manual": "يدوية",
    "shift": "بعد إغلاق الشيفت",
}
FILE_RE = re.compile(
    r"^openstore-(?P<db>[A-Za-z0-9_.-]+)-(?P<ts>\d{8}-\d{6})-(?P<kind>daily|manual|shift)\.sql\.gz$"
)
DUMP_TRAILER = b"PostgreSQL database dump complete"
DUMP_TIMEOUT_SECONDS = 2 * 60 * 60
STARTUP_DELAY_SECONDS = 90
TICK_SECONDS = 30
RETRY_AFTER_FAILURE = timedelta(minutes=30)
MAX_DAILY_ATTEMPTS = 3
SHIFT_BACKUP_MIN_GAP = timedelta(minutes=20)

DEFAULT_SETTINGS: Dict[str, Any] = {
    "enabled": True,
    "time": "03:00",
    "keep_daily": 14,
    "keep_weekly": 8,
    "dir_override": "",
    "send_telegram": True,
    "after_shift_close": False,
}

_run_lock = threading.Lock()
_running: Dict[str, Any] = {"running": False, "kind": None, "started_at": None}
_status_cache: Dict[str, Any] = {}


class BackupError(Exception):
    pass


# ─── Settings / status ──────────────────────────────────────────────────────


def _db_name_safe() -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", DATABASE or "db") or "db"


def _valid_time(value: str) -> bool:
    return bool(re.match(r"^([01]\d|2[0-3]):[0-5]\d$", str(value or "")))


def normalize_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    s = dict(DEFAULT_SETTINGS)
    if isinstance(raw, dict):
        s.update({k: v for k, v in raw.items() if k in DEFAULT_SETTINGS})
    s["enabled"] = bool(s["enabled"])
    s["send_telegram"] = bool(s["send_telegram"])
    s["after_shift_close"] = bool(s["after_shift_close"])
    if not _valid_time(s["time"]):
        s["time"] = DEFAULT_SETTINGS["time"]
    try:
        s["keep_daily"] = min(365, max(1, int(s["keep_daily"])))
    except (TypeError, ValueError):
        s["keep_daily"] = DEFAULT_SETTINGS["keep_daily"]
    try:
        s["keep_weekly"] = min(104, max(0, int(s["keep_weekly"])))
    except (TypeError, ValueError):
        s["keep_weekly"] = DEFAULT_SETTINGS["keep_weekly"]
    s["dir_override"] = str(s.get("dir_override") or "").strip()
    return s


def load_settings() -> Dict[str, Any]:
    return normalize_settings(tu.meta_get_json(SETTINGS_KEY, None))


def load_status() -> Dict[str, Any]:
    stored = tu.meta_get_json(STATUS_KEY, None)
    if isinstance(stored, dict):
        _status_cache.clear()
        _status_cache.update(stored)
    return dict(_status_cache)


def _update_status(**changes: Any) -> Dict[str, Any]:
    status = load_status()
    status.update(changes)
    _status_cache.clear()
    _status_cache.update(status)
    tu.meta_set_json(STATUS_KEY, status)
    return status


# ─── Folder resolution ──────────────────────────────────────────────────────


def _windows_documents_dir() -> Optional[str]:
    """The real Documents folder (follows OneDrive / folder redirection)."""
    try:
        import ctypes

        buf = ctypes.create_unicode_buffer(260)
        # CSIDL_PERSONAL = 5 (Documents), SHGFP_TYPE_CURRENT = 0
        if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0:
            return buf.value or None
    except Exception:
        pass
    return None


def _in_docker() -> bool:
    return os.path.exists("/.dockerenv")


def default_backup_dir() -> Tuple[str, str]:
    env_dir = (getenv("BACKUP_DIR") or "").strip()
    if env_dir:
        return env_dir, "env"
    if os.name == "nt":
        docs = _windows_documents_dir() or os.path.join(
            os.path.expanduser("~"), "Documents"
        )
        return os.path.join(docs, "OpenStore Backups"), "documents"
    if _in_docker():
        return "/backups", "docker"
    return os.path.join(os.path.expanduser("~"), "OpenStore Backups"), "home"


def resolve_backup_dir(settings: Optional[Dict[str, Any]] = None) -> Tuple[str, str]:
    settings = settings or load_settings()
    if settings.get("dir_override"):
        return settings["dir_override"], "override"
    return default_backup_dir()


def _is_mount_point_or_under_one(path: str) -> bool:
    """Linux: is `path` on a bind mount / volume (not the container's own fs)?"""
    try:
        with open("/proc/self/mountinfo", "r", encoding="utf-8") as fh:
            mounts = [line.split()[4] for line in fh if len(line.split()) > 4]
    except OSError:
        return True  # can't tell; don't raise a false alarm
    path = os.path.abspath(path)
    for mount in mounts:
        if mount == "/":
            continue
        if path == mount or path.startswith(mount.rstrip("/") + "/"):
            return True
    return False


def persistence_warning(path: str) -> Optional[str]:
    if os.name != "nt" and _in_docker() and not _is_mount_point_or_under_one(path):
        return (
            "مجلد النسخ داخل حاوية Docker وليس مربوطًا بمجلد على السيرفر، "
            "وسيُحذف عند إعادة بناء الحاوية. اربط مجلدًا (volume) بالمسار "
            f"{path} أو اضبط BACKUP_DIR."
        )
    return None


# ─── pg_dump ────────────────────────────────────────────────────────────────


def find_pg_dump() -> Optional[str]:
    exe = "pg_dump.exe" if os.name == "nt" else "pg_dump"
    explicit = (getenv("PG_DUMP_PATH") or "").strip()
    if explicit and os.path.isfile(explicit):
        return explicit
    bin_dir = (getenv("PG_BIN_DIR") or "").strip()
    if bin_dir and os.path.isfile(os.path.join(bin_dir, exe)):
        return os.path.join(bin_dir, exe)
    # The Electron app puts its bundled Postgres bin dir first on PATH.
    found = shutil.which("pg_dump")
    if found:
        return found
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, "..", "pgsql", "bin", exe),  # resources/backend/
        os.path.join(here, "..", "backend-dist", "pgsql", "bin", exe),  # dev tree
    ):
        if os.path.isfile(candidate):
            return os.path.normpath(candidate)
    return None


def _pg_dump_cmd() -> Tuple[List[str], Dict[str, str]]:
    pg_dump = find_pg_dump()
    if not pg_dump:
        raise BackupError("لم يتم العثور على برنامج pg_dump على هذا الجهاز")
    cmd = [pg_dump, "-h", HOST or "localhost", "-U", USER or "", "-d", DATABASE or ""]
    port = (getenv("PGPORT") or "").strip()
    if port:
        cmd += ["-p", port]
    cmd.append("--no-password")
    env = dict(os.environ)
    env["PGPASSWORD"] = PASS or ""
    return cmd, env


def _creationflags() -> int:
    # The backend has no console on Windows; without this every pg_dump run
    # would flash a console window on the shop PC.
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


def dump_database(dest_path: str, compress: bool) -> int:
    """
    pg_dump (plain SQL) into dest_path, gzip-compressed if `compress`.
    Writes to a .partial file and renames on success. Raises BackupError on a
    non-zero exit code, an empty dump or a dump without the completion
    trailer. Returns the uncompressed size in bytes.
    """
    cmd, env = _pg_dump_cmd()
    partial = dest_path + ".partial"
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        creationflags=_creationflags(),
    )
    stderr_parts: List[bytes] = []

    def _drain_stderr():
        try:
            stderr_parts.append(proc.stderr.read() or b"")
        except Exception:
            pass

    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
    stderr_thread.start()
    watchdog = threading.Timer(DUMP_TIMEOUT_SECONDS, proc.kill)
    watchdog.start()

    raw_bytes = 0
    tail = b""
    try:
        with open(partial, "wb") as fh:
            sink = gzip.GzipFile(fileobj=fh, mode="wb", compresslevel=6) if compress else fh
            try:
                while True:
                    chunk = proc.stdout.read(1024 * 1024)
                    if not chunk:
                        break
                    sink.write(chunk)
                    raw_bytes += len(chunk)
                    tail = (tail + chunk)[-1024:]
            finally:
                if compress:
                    sink.close()
        returncode = proc.wait()
        stderr_thread.join(timeout=10)
        stderr = b"".join(stderr_parts).decode("utf-8", errors="replace").strip()

        if returncode != 0:
            detail = stderr[-400:] if stderr else f"exit code {returncode}"
            raise BackupError(f"فشل pg_dump (رمز {returncode}): {detail}")
        if raw_bytes == 0:
            raise BackupError("pg_dump لم ينتج أي بيانات")
        if DUMP_TRAILER not in tail:
            raise BackupError("ملف النسخة غير مكتمل (لم يصل pg_dump لنهاية النسخ)")
        os.replace(partial, dest_path)
        return raw_bytes
    except BaseException:
        try:
            proc.kill()
        except Exception:
            pass
        try:
            if os.path.exists(partial):
                os.remove(partial)
        except OSError:
            pass
        raise
    finally:
        watchdog.cancel()
        try:
            proc.stdout.close()
        except Exception:
            pass


# ─── Manifest + retention ───────────────────────────────────────────────────


def _manifest_path(folder: str) -> str:
    return os.path.join(folder, MANIFEST_NAME)


def _load_manifest(folder: str) -> List[str]:
    try:
        with open(_manifest_path(folder), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        files = data.get("files") if isinstance(data, dict) else None
        return [f for f in files if isinstance(f, str)] if isinstance(files, list) else []
    except (OSError, ValueError):
        return []


def _save_manifest(folder: str, files: List[str]) -> None:
    payload = {
        "about": "Backups created by OpenStore. Only files listed here are ever "
        "deleted by its retention policy.",
        "files": sorted(set(files)),
    }
    fd, tmp = tempfile.mkstemp(prefix=".manifest-", dir=folder)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, _manifest_path(folder))


def _parse_name(name: str) -> Optional[Dict[str, Any]]:
    m = FILE_RE.match(name)
    if not m:
        return None
    try:
        ts = datetime.strptime(m.group("ts"), "%Y%m%d-%H%M%S")
    except ValueError:
        return None
    return {"db": m.group("db"), "ts": ts, "kind": m.group("kind")}


def apply_retention(
    folder: str, keep_daily: int, keep_weekly: int, today: Optional[date] = None
) -> List[str]:
    """Delete old managed backups of this database. Returns deleted names."""
    today = today or tu.local_now().date()
    manifest = _load_manifest(folder)
    db = _db_name_safe()
    entries: List[Tuple[datetime, str]] = []
    for name in manifest:
        info = _parse_name(name)
        if not info or info["db"] != db:
            continue
        if not os.path.isfile(os.path.join(folder, name)):
            continue
        entries.append((info["ts"], name))
    entries.sort(reverse=True)

    keep = set()
    day_best: Dict[date, str] = {}
    week_best: Dict[Tuple[int, int], str] = {}
    for ts, name in entries:
        day_best.setdefault(ts.date(), name)
        iso = ts.isocalendar()
        week_best.setdefault((iso[0], iso[1]), name)
        if ts.date() == today:
            keep.add(name)
    for d in sorted(day_best, reverse=True)[: max(1, keep_daily)]:
        keep.add(day_best[d])
    for w in sorted(week_best, reverse=True)[: max(0, keep_weekly)]:
        keep.add(week_best[w])
    if entries:
        keep.add(entries[0][1])

    deleted: List[str] = []
    for _ts, name in entries:
        if name in keep:
            continue
        try:
            os.remove(os.path.join(folder, name))
            deleted.append(name)
        except OSError as e:
            logger.warning(f"Could not delete old backup {name}: {e}")

    remaining = [
        n
        for n in manifest
        if n not in deleted and os.path.isfile(os.path.join(folder, n))
    ]
    if remaining != manifest:
        try:
            _save_manifest(folder, remaining)
        except OSError as e:
            logger.warning(f"Could not update backup manifest: {e}")
    return deleted


def list_backups(folder: str, limit: int = 60) -> List[Dict[str, Any]]:
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    managed = set(_load_manifest(folder))
    items = []
    for name in names:
        info = _parse_name(name)
        if not info:
            continue
        path = os.path.join(folder, name)
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        items.append(
            {
                "name": name,
                "size": size,
                "created_at": info["ts"].isoformat(timespec="seconds"),
                "kind": info["kind"],
                "managed": name in managed,
                "other_db": info["db"] != _db_name_safe(),
            }
        )
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items[:limit]


# ─── Telegram ───────────────────────────────────────────────────────────────


def _store_names() -> str:
    names = [s.get("name") for s in _all_stores() if s.get("name")]
    if len(names) > 1:
        # Store 0 is the warehouse; the shops are the interesting names.
        named = [s.get("name") for s in _all_stores() if s.get("id") != 0 and s.get("name")]
        names = named or names
    text = "، ".join(names)
    return text[:120] if text else "-"


def _all_stores() -> List[Dict[str, Any]]:
    try:
        conn = tu._db_connect()
        try:
            cur = conn.cursor()
            cur.execute("SELECT id, name FROM store_data ORDER BY id")
            rows = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
            cur.close()
        finally:
            conn.close()
        return rows
    except Exception:
        return []


def backup_chat_ids() -> List[str]:
    seen: List[str] = []
    for row in tu.get_all_store_chats():
        if row["chat_id"] and row["chat_id"] not in seen:
            seen.append(row["chat_id"])
    return seen


def _send_backup_to_telegram(
    path: str, size: int, kind: str, created: datetime, chat_ids: List[str]
) -> Dict[str, Any]:
    if not tu.current_bot_token():
        return {"sent": False, "message": "بوت تليجرام غير مُعد"}
    if not chat_ids:
        return {"sent": False, "message": "لا توجد محادثة تليجرام مرتبطة بأي متجر"}

    header = [
        f"💾 <b>نسخة احتياطية {KIND_AR.get(kind, '')}</b>",
        f"🏪 {tu.esc(_store_names())}",
        f"📅 {created.strftime('%Y-%m-%d %H:%M')}",
        f"📦 {tu.fmt_size(size)}",
    ]
    too_large = size > tu.MAX_UPLOAD_BYTES
    errors = []
    for chat_id in chat_ids:
        if too_large:
            text = "\n".join(
                header
                + [
                    "",
                    "⚠️ حجم النسخة أكبر من حد تليجرام (50 MB) فلم تُرسل كملف.",
                    f"📁 محفوظة على الجهاز في:\n<code>{tu.esc(path)}</code>",
                ]
            )
            result = tu.send_telegram_message(chat_id, text)
        else:
            caption = "\n".join(header + [f"📁 <code>{tu.esc(path)}</code>"])
            result = tu.send_telegram_document(chat_id, path, caption)
        if not result.get("success"):
            errors.append(str(result.get("message") or "خطأ غير معروف"))
    if errors:
        return {"sent": False, "message": "تعذر الإرسال: " + "؛ ".join(errors[:2])}
    return {
        "sent": True,
        "message": "أُرسلت رسالة (الملف أكبر من 50 MB)" if too_large else "أُرسل الملف",
        "as_file": not too_large,
    }


def _notify_failure(kind: str, error: str, chat_ids: List[str]) -> None:
    if not chat_ids or not tu.current_bot_token():
        return
    text = (
        f"❌ <b>فشل النسخ الاحتياطي ({KIND_AR.get(kind, kind)})</b>\n"
        f"📅 {tu.local_now().strftime('%Y-%m-%d %H:%M')}\n"
        f"⚠️ {tu.esc(error[:600])}"
    )
    for chat_id in chat_ids:
        tu.send_telegram_message(chat_id, text)


# ─── Running a backup ───────────────────────────────────────────────────────


def is_running() -> bool:
    return bool(_running["running"])


def run_backup(
    kind: str = "manual",
    notify_chat_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run one backup now (blocking). `notify_chat_ids` (e.g. the chat that asked
    from Telegram) receives the result even if automatic sending is off.
    Never raises; the outcome is also recorded in the status.
    """
    if kind not in KINDS:
        kind = "manual"
    if not _run_lock.acquire(blocking=False):
        return {"success": False, "already_running": True, "error": "يوجد نسخ احتياطي قيد التشغيل"}

    started = tu.local_now()
    _running.update(running=True, kind=kind, started_at=started.isoformat(timespec="seconds"))
    try:
        settings = load_settings()
        folder, source = resolve_backup_dir(settings)
        if notify_chat_ids is not None:
            chat_ids = list(notify_chat_ids)
        elif settings["send_telegram"]:
            chat_ids = backup_chat_ids()
        else:
            chat_ids = []

        name = f"openstore-{_db_name_safe()}-{started.strftime('%Y%m%d-%H%M%S')}-{kind}.sql.gz"
        path = os.path.join(folder, name)
        _update_status(
            last_run_at=started.isoformat(timespec="seconds"),
            last_kind=kind,
            last_result="running",
        )

        try:
            os.makedirs(folder, exist_ok=True)
            raw_size = dump_database(path, compress=True)
            manifest = _load_manifest(folder)
            manifest.append(name)
            _save_manifest(folder, manifest)
            size = os.path.getsize(path)
        except Exception as e:
            error = str(e) if isinstance(e, (BackupError, OSError)) else f"{type(e).__name__}: {e}"
            logger.error(f"Backup failed: {error}")
            _update_status(
                last_result="failed",
                last_error=error,
                last_failure_at=tu.local_now().isoformat(timespec="seconds"),
                last_duration_s=round((tu.local_now() - started).total_seconds(), 1),
            )
            if kind != "manual" or notify_chat_ids is not None:
                _notify_failure(kind, error, chat_ids)
            return {"success": False, "error": error}

        deleted: List[str] = []
        try:
            deleted = apply_retention(folder, settings["keep_daily"], settings["keep_weekly"])
        except Exception as e:
            logger.warning(f"Backup retention failed: {e}")

        telegram: Dict[str, Any] = {"sent": False, "message": "الإرسال إلى تليجرام متوقف"}
        if chat_ids or settings["send_telegram"]:
            telegram = _send_backup_to_telegram(path, size, kind, started, chat_ids)

        result = {
            "success": True,
            "path": path,
            "name": name,
            "size": size,
            "raw_size": raw_size,
            "deleted": deleted,
            "telegram": telegram,
            "dir_source": source,
        }
        _update_status(
            last_result="success",
            last_error=None,
            last_success_at=tu.local_now().isoformat(timespec="seconds"),
            last_path=path,
            last_name=name,
            last_size=size,
            last_duration_s=round((tu.local_now() - started).total_seconds(), 1),
            last_deleted=deleted,
            telegram=telegram,
        )
        logger.info(f"Backup saved: {path} ({tu.fmt_size(size)})")
        return result
    finally:
        _running.update(running=False, kind=None, started_at=None)
        _run_lock.release()


def start_backup_in_background(
    kind: str = "manual", notify_chat_ids: Optional[List[str]] = None
) -> bool:
    """Fire-and-forget; False if a backup is already running."""
    if is_running():
        return False
    threading.Thread(
        target=run_backup, args=(kind, notify_chat_ids), daemon=True, name="backup"
    ).start()
    return True


# ─── Scheduler ──────────────────────────────────────────────────────────────


def _slot_for(day: date, hhmm: str) -> datetime:
    hour, minute = (int(x) for x in hhmm.split(":"))
    return datetime(day.year, day.month, day.day, hour, minute)


def next_run_at(settings: Dict[str, Any], status: Dict[str, Any]) -> Optional[str]:
    if not settings["enabled"]:
        return None
    now = tu.local_now()
    today_slot = _slot_for(now.date(), settings["time"])
    daily = status.get("daily") or {}
    finished_today = daily.get("date") == now.date().isoformat() and (
        daily.get("done") or int(daily.get("attempts") or 0) >= MAX_DAILY_ATTEMPTS
    )
    if finished_today:
        tomorrow = now.date() + timedelta(days=1)
        return _slot_for(tomorrow, settings["time"]).isoformat(timespec="minutes")
    if now < today_slot:
        return today_slot.isoformat(timespec="minutes")
    if daily.get("date") == now.date().isoformat() and daily.get("last_attempt_at"):
        try:
            retry = datetime.fromisoformat(daily["last_attempt_at"]) + RETRY_AFTER_FAILURE
            return max(retry, now).isoformat(timespec="minutes")
        except ValueError:
            pass
    # Slot passed and not done yet: it runs at the next scheduler tick.
    return now.isoformat(timespec="minutes")


def _daily_due(settings: Dict[str, Any], status: Dict[str, Any], now: datetime) -> bool:
    if now < _slot_for(now.date(), settings["time"]):
        return False
    daily = status.get("daily") or {}
    if daily.get("date") != now.date().isoformat():
        return True
    if daily.get("done"):
        return False
    if int(daily.get("attempts") or 0) >= MAX_DAILY_ATTEMPTS:
        return False
    try:
        last = datetime.fromisoformat(daily.get("last_attempt_at"))
    except (TypeError, ValueError):
        return True
    return now - last >= RETRY_AFTER_FAILURE


def _latest_closed_shift_end() -> Optional[datetime]:
    try:
        conn = tu._db_connect()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT MAX(end_date_time) FROM shifts WHERE current = FALSE AND end_date_time IS NOT NULL"
            )
            row = cur.fetchone()
            cur.close()
        finally:
            conn.close()
        return row[0] if row else None
    except Exception:
        return None


def scheduler_tick(now: Optional[datetime] = None) -> Optional[str]:
    """One scheduler step; returns the kind of backup it ran (or None)."""
    now = now or tu.local_now()
    settings = load_settings()
    if not settings["enabled"] or is_running():
        return None
    status = load_status()

    if _daily_due(settings, status, now):
        daily = status.get("daily") or {}
        attempts = int(daily.get("attempts") or 0) if daily.get("date") == now.date().isoformat() else 0
        _update_status(
            daily={
                "date": now.date().isoformat(),
                "attempts": attempts + 1,
                "last_attempt_at": now.isoformat(timespec="seconds"),
                "done": False,
            }
        )
        result = run_backup("daily")
        if result.get("success"):
            st = load_status()
            daily = st.get("daily") or {}
            daily["done"] = True
            _update_status(daily=daily)
        return "daily"

    if settings["after_shift_close"]:
        latest = _latest_closed_shift_end()
        if latest is None:
            return None
        seen = status.get("last_shift_end_seen")
        latest_iso = latest.isoformat(timespec="seconds")
        if not seen:
            # First run: remember where we are, don't back up old shifts.
            _update_status(last_shift_end_seen=latest_iso)
            return None
        if latest_iso > seen:
            try:
                last_shift_backup = datetime.fromisoformat(status.get("last_shift_backup_at") or "")
            except ValueError:
                last_shift_backup = None
            _update_status(last_shift_end_seen=latest_iso)
            if last_shift_backup is None or now - last_shift_backup >= SHIFT_BACKUP_MIN_GAP:
                _update_status(last_shift_backup_at=now.isoformat(timespec="seconds"))
                run_backup("shift")
                return "shift"
    return None


async def backup_scheduler_loop() -> None:
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            await asyncio.to_thread(scheduler_tick)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Backup scheduler error: {e}")
        await asyncio.sleep(TICK_SECONDS)


# ─── Summary for the API / Telegram ─────────────────────────────────────────


def get_overview() -> Dict[str, Any]:
    settings = load_settings()
    status = load_status()
    folder, source = resolve_backup_dir(settings)
    default_dir, default_source = default_backup_dir()
    return {
        "settings": settings,
        "defaults": DEFAULT_SETTINGS,
        "status": status,
        "running": dict(_running),
        "next_run_at": next_run_at(settings, status),
        "dir": folder,
        "dir_source": source,
        "default_dir": default_dir,
        "default_dir_source": default_source,
        "dir_exists": os.path.isdir(folder),
        "persistence_warning": persistence_warning(folder),
        "pg_dump_found": find_pg_dump() is not None,
        "telegram_configured": bool(tu.current_bot_token()),
        "telegram_chats": len(backup_chat_ids()),
        "backups": list_backups(folder),
    }


# ─── API ────────────────────────────────────────────────────────────────────


class BackupSettingsIn(BaseModel):
    enabled: bool = True
    time: str = "03:00"
    keep_daily: int = 14
    keep_weekly: int = 8
    dir_override: str = ""
    send_telegram: bool = True
    after_shift_close: bool = False


def _check_writable(folder: str) -> None:
    if not os.path.isabs(folder):
        raise HTTPException(status_code=400, detail="اكتب مسارًا كاملًا للمجلد")
    try:
        os.makedirs(folder, exist_ok=True)
        fd, probe = tempfile.mkstemp(prefix=".write-test-", dir=folder)
        os.close(fd)
        os.remove(probe)
    except OSError as e:
        raise HTTPException(
            status_code=400, detail=f"لا يمكن الكتابة في المجلد: {e.strerror or e}"
        ) from e


@router.get("/backup/settings")
def get_backup_settings(current_user: dict = Depends(get_current_user)):
    return get_overview()


@router.put("/backup/settings")
def put_backup_settings(
    body: BackupSettingsIn, current_user: dict = Depends(get_current_user)
):
    if not _valid_time(body.time):
        raise HTTPException(status_code=400, detail="وقت النسخ غير صالح (HH:MM)")
    if not 1 <= body.keep_daily <= 365:
        raise HTTPException(status_code=400, detail="عدد النسخ اليومية بين 1 و 365")
    if not 0 <= body.keep_weekly <= 104:
        raise HTTPException(status_code=400, detail="عدد النسخ الأسبوعية بين 0 و 104")
    raw = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    data = normalize_settings(raw)
    if data["dir_override"]:
        _check_writable(data["dir_override"])
    if not tu.meta_set_json(SETTINGS_KEY, data):
        raise HTTPException(status_code=500, detail="تعذر حفظ الإعدادات")
    return get_overview()


@router.get("/backup/status")
def get_backup_status(current_user: dict = Depends(get_current_user)):
    return get_overview()


@router.post("/backup/run")
def post_backup_run(current_user: dict = Depends(get_current_user)):
    if not find_pg_dump():
        raise HTTPException(
            status_code=400, detail="لم يتم العثور على برنامج pg_dump على هذا الجهاز"
        )
    if not start_backup_in_background("manual"):
        raise HTTPException(status_code=409, detail="يوجد نسخ احتياطي قيد التشغيل بالفعل")
    return {"started": True}
