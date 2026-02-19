# Load timezone settings
import os
import platform
import asyncio

os.environ["TZ"] = "Africa/Cairo"
if platform.system() != "Windows":
    import time

    time.tzset()
else:
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Note: Telegram notifications are sent directly via Bot API - no separate service needed

# Now import and run your actual app
from main import app
