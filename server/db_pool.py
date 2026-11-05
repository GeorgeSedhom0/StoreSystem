"""
Transparent PostgreSQL connection reuse (v26 performance).

Every request used to open a brand-new connection (TCP + auth + a new server
backend process) and close it at the end. This module makes
psycopg2.connect() hand out an idle connection when one is available and makes
close() give it back instead of closing it, so no call site has to change.

Safety rules:
- A connection is only reused when it is cleanly idle: an open transaction is
  rolled back on close(), a broken/unknown connection is discarded.
- Runtime code only uses transaction-scoped settings (SET LOCAL), so nothing
  leaks from one user of a connection to the next; autocommit is reset anyway.
- A connection idle for a while is pinged before reuse (the server may have
  restarted).
- Never blocks: when no idle connection exists a new one is opened; at most
  MAX_IDLE are kept, extras are really closed.

Disable with DB_POOL=0 in the environment.
"""

import os
import threading
import time

import psycopg2
import psycopg2.extensions as ext

MAX_IDLE = int(os.getenv("DB_POOL_MAX_IDLE", "8"))
PING_AFTER_SECONDS = 30.0

_real_connect = psycopg2.connect
_lock = threading.Lock()
# key -> list of (connection, last_used_monotonic)
_idle: dict = {}


def _key(args, kwargs):
    return (args, tuple(sorted((k, str(v)) for k, v in kwargs.items())))


def _alive(conn) -> bool:
    if conn.closed:
        return False
    try:
        conn.autocommit = True
        with conn.cursor() as c:
            c.execute("SELECT 1")
        conn.autocommit = False
        return True
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return False


def _release(key, conn) -> None:
    """Give a connection back (or close it if it can't be reused)."""
    try:
        if conn.closed:
            return
        status = conn.get_transaction_status()
        if status == ext.TRANSACTION_STATUS_UNKNOWN:
            conn.close()
            return
        if status != ext.TRANSACTION_STATUS_IDLE:
            conn.rollback()
        if conn.autocommit:
            conn.autocommit = False
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return
    with _lock:
        bucket = _idle.setdefault(key, [])
        if len(bucket) < MAX_IDLE:
            bucket.append((conn, time.monotonic()))
            return
    conn.close()


class PooledConnection:
    """A psycopg2 connection whose close() returns it to the pool."""

    __slots__ = ("_conn", "_key")

    def __init__(self, conn, key):
        object.__setattr__(self, "_conn", conn)
        object.__setattr__(self, "_key", key)

    def close(self):
        conn = self._conn
        if conn is None:
            return
        object.__setattr__(self, "_conn", None)
        _release(self._key, conn)

    @property
    def closed(self):
        return 1 if self._conn is None else self._conn.closed

    def __getattr__(self, name):
        conn = object.__getattribute__(self, "_conn")
        if conn is None:
            raise psycopg2.InterfaceError("connection already closed")
        return getattr(conn, name)

    def __setattr__(self, name, value):
        if self._conn is None:
            raise psycopg2.InterfaceError("connection already closed")
        setattr(self._conn, name, value)

    # `with conn:` commits/rolls back like a real connection (doesn't close).
    def __enter__(self):
        self._conn.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        return self._conn.__exit__(exc_type, exc, tb)

    # Deliberately no __del__: a connection someone forgets to close() is
    # simply closed by psycopg2 when collected (as before pooling). Returning
    # it from a finalizer would take _lock inside garbage collection, which can
    # run while this same thread already holds it (self-deadlock).


def pooled_connect(*args, **kwargs):
    # Only plain keyword/DSN connects are pooled (that's every runtime call).
    if kwargs.get("connection_factory") or kwargs.get("async_") or kwargs.get("async"):
        return _real_connect(*args, **kwargs)
    key = _key(args, kwargs)
    while True:
        with _lock:
            bucket = _idle.get(key)
            item = bucket.pop() if bucket else None
        if item is None:
            return PooledConnection(_real_connect(*args, **kwargs), key)
        conn, last_used = item
        if conn.closed:
            continue
        if time.monotonic() - last_used > PING_AFTER_SECONDS and not _alive(conn):
            continue
        return PooledConnection(conn, key)


def install() -> None:
    if os.getenv("DB_POOL", "1") == "0":
        return
    if psycopg2.connect is not pooled_connect:
        psycopg2.connect = pooled_connect


install()
