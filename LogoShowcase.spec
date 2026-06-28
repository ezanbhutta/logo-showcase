# PyInstaller spec — bundles the app into a single LogoShowcase.exe.
#
# Build (on Windows):  pyinstaller LogoShowcase.spec
# Output:              dist/LogoShowcase.exe  (one file, no Python needed)
#
# Bundled read-only resources (fonts, demo profiles, web templates/static) are
# unpacked at runtime to sys._MEIPASS, which engine.resources.base_dir() returns.

import os
from PyInstaller.utils.hooks import collect_all

datas = []


def _add_tree(folder, dest_root):
    for dirpath, _dirs, files in os.walk(folder):
        rel = os.path.relpath(dirpath, folder)
        dest = dest_root if rel == "." else os.path.join(dest_root, rel)
        for f in files:
            datas.append((os.path.join(dirpath, f), dest))


# Fonts and demo profiles resolve via base_dir()/fonts and base_dir()/profiles.
_add_tree("fonts", "fonts")
_add_tree("profiles", "profiles")
# Flask finds templates/static relative to the webapp package dir.
_add_tree("webapp/templates", "webapp/templates")
_add_tree("webapp/static", "webapp/static")

# Pull in ReportLab + Pillow data/binaries/hidden imports so nothing is missing.
hiddenimports = []
for pkg in ("reportlab", "PIL"):
    d, b, h = collect_all(pkg)
    datas += d
    hiddenimports += h

block_cipher = None

a = Analysis(
    ["run_app.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter"],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name="LogoShowcase",
    debug=False,
    strip=False,
    upx=True,
    console=True,          # a small console window doubles as the "quit" window
    disable_windowed_traceback=False,
    icon=None,
)
