"""Locate bundled, read-only resources (fonts, demo profiles, templates).

Works both when running from source and when frozen into a single-file
executable by PyInstaller, where bundled data is unpacked to ``sys._MEIPASS``.
Writable paths (config, preview cache, output) never come from here — see
:mod:`engine.config`.
"""

from __future__ import annotations

import sys
from pathlib import Path


def base_dir() -> Path:
    if getattr(sys, "frozen", False):  # packaged .exe
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    return Path(__file__).resolve().parent.parent
