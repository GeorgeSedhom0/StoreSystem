# Load timezone settings
import os
import time

os.environ["TZ"] = "Africa/Cairo"
time.tzset()

# Note: Telegram notifications are sent directly via Bot API - no separate service needed

# Now import and run your actual app
from main import app
