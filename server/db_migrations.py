"""
Manual database migrations (Settings → الأساسيات → متقدم).

For a restored backup that is older than the app (e.g. moving a store from an
old server to the desktop app):

- GET  /db-migrations            the database's own version (db_meta), the
                                 latest the app ships, and every update_db_N.py
- POST /db-migrations/run        run one migration
- POST /db-migrations/run-pending
                                 run every migration above the current version,
                                 in order, stopping at the first failure
- PUT  /db-migrations/version    set the recorded version by hand (e.g. a
                                 pre-v18 backup with no version, or after
                                 running scripts yourself)

Migrations run as their own process with this backend's Python and
environment, exactly like the desktop app does on startup. After a script
succeeds the recorded version becomes max(its number, the version before), so
scripts before v18 (which don't record one) advance it and re-running an old
script never lowers it. A backup is taken first unless the caller opts out.

Access: the user's scope must include /settings (checked server-side).
"""

import logging
import os
import re
import subprocess
import sys
import threading
from os import getenv
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import backup_scheduler as bs
from analytics_utils import Database
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

logger = logging.getLogger(__name__)
router = APIRouter(tags=["db-migrations"])

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_RE = re.compile(r"^update_db_(\d+)\.py$")
TIMEOUT_SECONDS = 60 * 60
OUTPUT_TAIL = 4000

_lock = threading.Lock()


def require_settings_access(current_user: dict = Depends(get_current_user)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            SELECT 1 FROM scopes s JOIN pages p ON p.id = ANY(s.pages)
            WHERE s.id = %s AND p.path = '/settings'
            """,
            (current_user.get("scope_id"),),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية الإعدادات")
    return current_user


# ─── Helpers ────────────────────────────────────────────────────────────────


def list_migrations() -> List[Dict[str, Any]]:
    out = []
    for name in os.listdir(SERVER_DIR):
        m = FILE_RE.match(name)
        if not m:
            continue
        out.append({"num": int(m.group(1)), "file": name, "summary": _summary(name)})
    out.sort(key=lambda x: x["num"])
    return out


def _summary(name: str) -> str:
    """First line of the script's docstring, or its first comment."""
    try:
        with open(os.path.join(SERVER_DIR, name), encoding="utf-8", errors="replace") as fh:
            head = fh.read(3000)
    except OSError:
        return ""
    m = re.search(r'^\s*(?:"""|\'\'\')\s*\n?\s*(.+)', head)
    if m:
        return m.group(1).strip().strip('"').strip()[:160]
    for line in head.splitlines():
        if line.strip().startswith("#"):
            return line.strip("# ").strip()[:160]
    return ""


def latest_version() -> int:
    nums = [m["num"] for m in list_migrations()]
    return max(nums) if nums else 0


def current_version() -> Optional[int]:
    """The database's own recorded version, None if it has none (pre-v18)."""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT to_regclass('public.db_meta') AS t")
            if not cur.fetchone()["t"]:
                return None
            cur.execute("SELECT value FROM db_meta WHERE key = 'version' LIMIT 1")
            row = cur.fetchone()
            return int(row["value"]) if row and row["value"] is not None else None
    except (TypeError, ValueError):
        return None


def set_version(version: int) -> None:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS db_meta (key VARCHAR PRIMARY KEY, value VARCHAR)")
        cur.execute(
            """
            INSERT INTO db_meta (key, value) VALUES ('version', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            (str(version),),
        )


def _run_script(num: int) -> Dict[str, Any]:
    name = f"update_db_{num}.py"
    path = os.path.join(SERVER_DIR, name)
    if not os.path.isfile(path):
        return {"num": num, "ok": False, "output": f"الملف {name} غير موجود"}
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"  # scripts print Arabic; Windows pipes are cp1252
    before = current_version()
    try:
        proc = subprocess.run(
            [sys.executable, path],
            cwd=SERVER_DIR,
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=TIMEOUT_SECONDS,
            creationflags=bs._creationflags(),
        )
    except subprocess.TimeoutExpired:
        return {"num": num, "ok": False, "output": "انتهت المهلة (ساعة) قبل اكتمال التحديث"}
    output = (proc.stdout or b"") + (proc.stderr or b"")
    text = output.decode("utf-8", errors="replace").strip()
    ok = proc.returncode == 0
    if ok:
        # Scripts from v18 on record their own number; re-running an older
        # one must not move the recorded version back.
        set_version(max(num, before or 0))
    logger.info(f"Migration {name}: {'ok' if ok else 'FAILED'}")
    return {"num": num, "ok": ok, "output": text[-OUTPUT_TAIL:]}


def _safety_backup() -> Optional[str]:
    result = bs.run_backup("manual")
    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail="تعذر أخذ نسخة احتياطية قبل التحديث: " + str(result.get("error") or "")
            + " (يمكنك المتابعة بدون نسخة من الخيار المتقدم)",
        )
    return result.get("path")


def overview() -> Dict[str, Any]:
    migrations = list_migrations()
    current = current_version()
    for m in migrations:
        m["applied"] = current is not None and m["num"] <= current
    return {
        "current": current,
        "latest": migrations[-1]["num"] if migrations else 0,
        "migrations": migrations,
        "running": _lock.locked(),
    }


# ─── API ────────────────────────────────────────────────────────────────────


class RunIn(BaseModel):
    num: int
    backup: bool = True


class RunPendingIn(BaseModel):
    backup: bool = True


class VersionIn(BaseModel):
    version: int


@router.get("/db-migrations")
def get_migrations(current_user: dict = Depends(require_settings_access)):
    return overview()


@router.post("/db-migrations/run")
def run_one(body: RunIn, current_user: dict = Depends(require_settings_access)):
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="يوجد تحديث قيد التشغيل")
    try:
        backup = _safety_backup() if body.backup else None
        result = _run_script(body.num)
        return {"results": [result], "backup": backup, **overview_unlocked()}
    finally:
        _lock.release()


@router.post("/db-migrations/run-pending")
def run_pending(body: RunPendingIn, current_user: dict = Depends(require_settings_access)):
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="يوجد تحديث قيد التشغيل")
    try:
        current = current_version()
        if current is None:
            raise HTTPException(
                status_code=400,
                detail="إصدار قاعدة البيانات غير معروف. حدده أولاً ثم شغّل التحديثات.",
            )
        pending = [m["num"] for m in list_migrations() if m["num"] > current]
        if not pending:
            return {"results": [], "backup": None, **overview_unlocked()}
        backup = _safety_backup() if body.backup else None
        results = []
        for num in pending:
            r = _run_script(num)
            results.append(r)
            if not r["ok"]:
                break
        return {"results": results, "backup": backup, **overview_unlocked()}
    finally:
        _lock.release()


@router.put("/db-migrations/version")
def put_version(body: VersionIn, current_user: dict = Depends(require_settings_access)):
    if body.version < 0 or body.version > latest_version():
        raise HTTPException(status_code=400, detail=f"الإصدار يجب أن يكون بين 0 و {latest_version()}")
    if _lock.locked():
        raise HTTPException(status_code=409, detail="يوجد تحديث قيد التشغيل")
    set_version(body.version)
    return overview()


def overview_unlocked() -> Dict[str, Any]:
    ov = overview()
    ov["running"] = False
    return ov
