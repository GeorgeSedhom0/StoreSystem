# Load timezone settings
import os
import time
os.environ["TZ"] = "Africa/Cairo"
time.tzset()

# Now import and run your actual app
from main import app