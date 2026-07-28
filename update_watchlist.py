#!/usr/bin/env python3
"""
Root CLI launcher for Watchlist Automation Pipeline.
"""

import sys
import os

pipeline_script = os.path.join(os.path.dirname(__file__), "update_pipeline", "update_watchlist.py")
os.execv(sys.executable, [sys.executable, pipeline_script] + sys.argv[1:])
