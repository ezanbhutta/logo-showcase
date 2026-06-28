"""CLI entrypoint — turn a tagged library into a client-matched PDF slice.

Examples
--------
    # matched slice for a construction client (Storm profile)
    python -m engine.showcase --profile storm --industry construction \\
        --mode slice --count 12 --out out/storm-construction.pdf

    # by type instead of industry
    python -m engine.showcase --profile eikon --type abstract --mode slice

    # combine filters: finance AND wordmark
    python -m engine.showcase --profile grid --industry finance-banking \\
        --type wordmark --match all

    # range sheet (whole profile, or filtered the same way)
    python -m engine.showcase --profile storm --mode range --out out/storm-range.pdf

    # explicit selection (e.g. exported from the gallery)
    python -m engine.showcase --profile storm --files apex-builders.png greenleaf.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import vocab
from .curate import Query, curate
from .library import Library, LogoEntry, load_library
from .render_range import render_range
from .render_slice import render_slice
from .theme import Theme, load_theme

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_COUNT = 12


class CLIError(Exception):
    """User-facing error; printed without a traceback."""


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        prog="python -m engine.showcase",
        description="Build a client-matched logo slice (or range sheet) PDF.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--profile", required=True, help="Profile (library + theme) to use.")
    ap.add_argument("--industry", action="append", default=[],
                    help="Filter by industry (repeatable).")
    ap.add_argument("--type", action="append", default=[], dest="types",
                    help="Filter by logo type (repeatable).")
    ap.add_argument("--match", choices=("any", "all"), default="any",
                    help="Combine filters with OR (any, default) or AND (all).")
    ap.add_argument("--files", nargs="+", default=[],
                    help="Explicit filenames to include (overrides filters; keeps tier order).")
    ap.add_argument("--mode", choices=("slice", "range"), default="slice",
                    help="Output mode (default: slice).")
    ap.add_argument("--count", type=int, default=DEFAULT_COUNT,
                    help=f"Cap for slice mode (default: {DEFAULT_COUNT}).")
    ap.add_argument("--out", default=None, help="Output path (auto-named if omitted).")
    ap.add_argument("--profiles-root", default=str(REPO_ROOT / "profiles"),
                    help="Root folder holding per-profile libraries.")
    ap.add_argument("--build", default=str(REPO_ROOT / "build"),
                    help="Build cache root (gitignored).")
    ap.add_argument("--out-root", default=str(REPO_ROOT / "out"),
                    help="Default output root (gitignored).")
    return ap.parse_args(argv)


def _normalize_query(industries: list[str], types: list[str], match: str) -> Query:
    try:
        norm_inds = [vocab.normalize_industry(v) for v in industries]
        norm_typs = [vocab.normalize_type(v) for v in types]
    except vocab.VocabError as exc:
        raise CLIError(f"invalid filter: {exc}") from exc
    return Query(industries=norm_inds, types=norm_typs, match_all=(match == "all"))


def _select_by_files(library: Library, files: list[str]) -> list[LogoEntry]:
    by_file = {e.file: e for e in library.entries}
    missing = [f for f in files if f not in by_file]
    if missing:
        raise CLIError(
            "these files are not in the library: " + ", ".join(missing)
        )
    chosen = [by_file[f] for f in files]
    # Keep curation order (tier, then year) even for an explicit selection.
    chosen.sort(key=lambda e: (e.tier, -(e.year or -1)))
    return chosen


def _auto_out_path(out_root: Path, profile: str, query: Query, mode: str) -> Path:
    bits = [profile, mode]
    if query.industries:
        bits.append("-".join(query.industries))
    if query.types:
        bits.append("-".join(query.types))
    name = "-".join(bits) + ".pdf"
    return out_root / name


def _fmt_size(n: int) -> str:
    mb = n / (1024 * 1024)
    return f"{mb:.2f} MB" if mb >= 0.1 else f"{n / 1024:.0f} KB"


def run(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    profiles_root = Path(args.profiles_root)
    build_dir = Path(args.build)
    out_root = Path(args.out_root)

    profile_dir = profiles_root / args.profile
    if not profile_dir.is_dir():
        raise CLIError(f"profile {args.profile!r} not found at {profile_dir}")

    library = load_library(profile_dir, profile=args.profile)
    theme = load_theme(profile_dir / "theme.json")

    query = _normalize_query(args.industry, args.types, args.match)

    # Selection ---------------------------------------------------------------
    if args.files:
        entries = _select_by_files(library, args.files)
        # An explicit --files list still respects the slice cap if smaller.
        if args.mode == "slice" and len(entries) > args.count:
            entries = entries[: args.count]
    elif args.mode == "slice":
        entries = curate(library, query, count=args.count)
    else:  # range: take everything matching, no cap
        entries = curate(library, query, count=None)

    if not entries:
        print(
            f"No matches for profile {args.profile!r} with filter "
            f"[{query.describe()}]. Nothing written.",
            file=sys.stderr,
        )
        return 2

    # Output path -------------------------------------------------------------
    out_path = Path(args.out) if args.out else _auto_out_path(
        out_root, args.profile, query, args.mode
    )

    # Render ------------------------------------------------------------------
    if args.mode == "slice":
        size = render_slice(library, theme, entries, query, out_path, build_dir)
    else:
        size = render_range(library, theme, entries, query, out_path, build_dir)

    warn = ""
    if args.mode == "slice" and size > 2 * 1024 * 1024:
        warn = "  ⚠ over 2 MB target"
    print(
        f"✓ {args.mode} · {len(entries)} marks · {theme.name}\n"
        f"  {out_path}  ({_fmt_size(size)}){warn}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    try:
        return run(argv)
    except CLIError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 — clean message, no traceback for users
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
