"""
The store's wall clock.

On Windows the C runtime doesn't understand IANA zone names: with
TZ=Africa/Cairo in the environment (the Electron .env sets it, and
main_wrapper sets it again) Python's datetime.now() silently returns UTC.
Bill times come from the client in local time, so anything the server stamps
itself must use the same local wall clock - resolve the zone explicitly.

On Linux/Docker TZ is applied with time.tzset(), so this returns exactly what
datetime.now() already did.
"""

import logging
import os
from datetime import datetime
from typing import Any, Dict

_ZONE_CACHE: Dict[str, Any] = {}


def _local_zone():
    """The store's IANA zone from $TZ (e.g. Africa/Cairo), or None."""
    name = (os.environ.get("TZ") or "").strip()
    if not name or "/" not in name:
        return None
    if name not in _ZONE_CACHE:
        try:
            from zoneinfo import ZoneInfo

            _ZONE_CACHE[name] = ZoneInfo(name)
        except Exception as e:  # e.g. no tzdata on Windows
            logging.getLogger(__name__).warning(
                "Store clock: can't resolve TZ=%s (%s); falling back to the "
                "process clock. Install the 'tzdata' package.", name, e
            )
            _ZONE_CACHE[name] = None
    return _ZONE_CACHE[name]


def local_now() -> datetime:
    """Naive wall-clock 'now' in the store's time zone."""
    zone = _local_zone()
    if zone is not None:
        return datetime.now(zone).replace(tzinfo=None)
    return datetime.now()


def local_iso() -> str:
    return local_now().isoformat()
