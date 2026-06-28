"""Launch the Logo Showcase desktop app.

Starts the local web server on a free port and opens the default browser to it.
This is the entry point both for ``python run_app.py`` during development and
for the packaged Windows executable.
"""

from __future__ import annotations

import socket
import threading
import webbrowser

from webapp import create_app


def _free_port(preferred: int = 5000) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def main() -> None:
    port = _free_port()
    url = f"http://127.0.0.1:{port}/"
    app = create_app()

    # Open the browser a moment after the server starts.
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    print("\n  Logo Showcase is running.")
    print(f"  Open this in your browser if it didn't open automatically:\n    {url}")
    print("  Close this window to quit.\n")
    # threaded=True so the browser's first requests don't block each other.
    app.run(host="127.0.0.1", port=port, threaded=True)


if __name__ == "__main__":
    main()
