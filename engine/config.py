"""User configuration — where the logo library lives and where PDFs are saved.

The library is a folder of profile sub-folders (each with ``logos/``,
``tags.csv``, ``theme.json``). In production that folder is the user's local
**Google Drive for Desktop** sync folder, set once on the Settings screen and
remembered here. Until it's set, we fall back to the demo ``profiles/`` shipped
with the app so it works out of the box.

Config is stored per-user (``%APPDATA%\\LogoShowcase\\config.json`` on Windows)
so it survives app updates and isn't shared between machines.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .resources import base_dir

APP_NAME = "LogoShowcase"
REPO_ROOT = base_dir()
BUNDLED_PROFILES = REPO_ROOT / "profiles"


def config_dir() -> Path:
    """Per-user config directory, created if missing."""
    if os.name == "nt":  # Windows
        base = Path(os.environ.get("APPDATA", Path.home()))
    elif os.sys.platform == "darwin":  # macOS
        base = Path.home() / "Library" / "Application Support"
    else:  # Linux and friends
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _config_file() -> Path:
    return config_dir() / "config.json"


def _default_output_dir() -> Path:
    """Where generated PDFs land by default — the user's Desktop if present."""
    desktop = Path.home() / "Desktop"
    return desktop if desktop.is_dir() else (REPO_ROOT / "out")


def load() -> dict:
    """Load saved config, applying defaults for anything unset."""
    cfg: dict = {}
    f = _config_file()
    if f.exists():
        try:
            cfg = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            cfg = {}
    cfg.setdefault("library_root", str(BUNDLED_PROFILES))
    cfg.setdefault("output_dir", str(_default_output_dir()))
    return cfg


def save(cfg: dict) -> None:
    _config_file().write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def library_root() -> Path:
    return Path(load()["library_root"]).expanduser()


def output_dir() -> Path:
    return Path(load()["output_dir"]).expanduser()


def set_library_root(path: str | Path) -> None:
    cfg = load()
    cfg["library_root"] = str(Path(path).expanduser())
    save(cfg)


def set_output_dir(path: str | Path) -> None:
    cfg = load()
    cfg["output_dir"] = str(Path(path).expanduser())
    save(cfg)


def is_using_bundled_demo() -> bool:
    return library_root().resolve() == BUNDLED_PROFILES.resolve()


def build_dir() -> Path:
    """Scratch dir for generated previews — kept next to the config, not in Drive."""
    d = config_dir() / "build"
    d.mkdir(parents=True, exist_ok=True)
    return d


def list_profiles(root: Path | None = None) -> list[str]:
    """Profile folders under the library root (those with tags.csv + theme.json)."""
    root = root or library_root()
    if not root.is_dir():
        return []
    out = []
    for p in sorted(root.iterdir()):
        if p.is_dir() and (p / "tags.csv").exists() and (p / "theme.json").exists():
            out.append(p.name)
    return out
