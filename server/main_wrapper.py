# Load timezone settings
import os
import time

os.environ["TZ"] = "Africa/Cairo"
time.tzset()

# Note: WhatsApp service is now running as a separate Docker container
# No initialization needed here - communication happens via HTTP API

# Now import and run your actual app
from main import app
