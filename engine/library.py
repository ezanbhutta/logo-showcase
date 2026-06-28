"""Load and validate a profile's ``tags.csv`` against the controlled vocab.

Each row becomes a :class:`LogoEntry`. Validation is loud by design: an
unknown industry/type, a malformed tier, a duplicate filename, or a missing
master image all raise before any rendering happens. The library is the
source of truth — if it's wrong, we stop here, not three steps downstream.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

from . import vocab

_TRUE = {"true", "1", "yes", "y", "t"}
_FALSE = {"false", "0", "no", "n", "f", ""}

_REQUIRED_COLUMNS = ("file", "name", "industries", "types", "tier")


class LibraryError(ValueError):
    """Raised when the library (folder layout or tags.csv) is invalid."""


@dataclass
class LogoEntry:
    file: str
    name: str
    industries: list[str]
    types: list[str]
    tier: int
    year: int | None = None
    active: bool = True
    notes: str = ""
    path: Path = field(default=Path(), repr=False)

    def matches(self, industries: list[str], types: list[str], match_all: bool) -> bool:
        """True if this entry satisfies the query under the given match mode.

        Only axes the caller actually supplied are tested. ``any`` matches when
        at least one supplied axis hits; ``all`` requires every supplied axis to
        hit. An empty query (no axes) matches everything.
        """
        checks: list[bool] = []
        if industries:
            checks.append(bool(set(industries) & set(self.industries)))
        if types:
            checks.append(bool(set(types) & set(self.types)))
        if not checks:
            return True
        return all(checks) if match_all else any(checks)


@dataclass
class Library:
    profile: str
    root: Path
    logos_dir: Path
    entries: list[LogoEntry]

    def active_entries(self) -> list[LogoEntry]:
        return [e for e in self.entries if e.active]


def _split_list(raw: str) -> list[str]:
    return [part.strip() for part in raw.split("|") if part.strip()]


def _parse_bool(raw: str, *, default: bool, file: str) -> bool:
    v = (raw or "").strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return default if v == "" else False
    raise LibraryError(f"{file}: invalid boolean for 'active': {raw!r}")


def _parse_int(raw: str, field_name: str, file: str) -> int:
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError) as exc:
        raise LibraryError(f"{file}: '{field_name}' must be an integer, got {raw!r}") from exc


def load_library(profile_dir: str | Path, *, profile: str | None = None) -> Library:
    """Load and validate the library under ``profile_dir``."""
    root = Path(profile_dir)
    profile = profile or root.name
    tags_path = root / "tags.csv"
    logos_dir = root / "logos"

    if not tags_path.exists():
        raise LibraryError(f"profile {profile!r}: tags.csv not found at {tags_path}")
    if not logos_dir.is_dir():
        raise LibraryError(f"profile {profile!r}: logos/ not found at {logos_dir}")

    with tags_path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        missing = [c for c in _REQUIRED_COLUMNS if c not in header]
        if missing:
            raise LibraryError(
                f"tags.csv is missing required column(s): {', '.join(missing)}"
            )

        entries: list[LogoEntry] = []
        seen: set[str] = set()
        for lineno, row in enumerate(reader, start=2):
            file = (row.get("file") or "").strip()
            if not file:
                raise LibraryError(f"tags.csv line {lineno}: empty 'file' value")
            if file in seen:
                raise LibraryError(f"tags.csv line {lineno}: duplicate file {file!r}")
            seen.add(file)

            name = (row.get("name") or "").strip()
            if not name:
                raise LibraryError(f"tags.csv line {lineno} ({file}): empty 'name'")

            raw_inds = _split_list(row.get("industries", ""))
            raw_typs = _split_list(row.get("types", ""))
            if not raw_inds:
                raise LibraryError(f"tags.csv line {lineno} ({file}): no industries")
            if not raw_typs:
                raise LibraryError(f"tags.csv line {lineno} ({file}): no types")

            try:
                industries = [vocab.normalize_industry(v) for v in raw_inds]
                types = [vocab.normalize_type(v) for v in raw_typs]
            except vocab.VocabError as exc:
                raise LibraryError(f"tags.csv line {lineno} ({file}): {exc}") from exc

            tier = _parse_int(row.get("tier", ""), "tier", f"tags.csv line {lineno}")
            if not 1 <= tier <= 5:
                raise LibraryError(
                    f"tags.csv line {lineno} ({file}): tier must be 1–5, got {tier}"
                )

            year_raw = (row.get("year") or "").strip()
            year = _parse_int(year_raw, "year", f"tags.csv line {lineno}") if year_raw else None

            active = _parse_bool(row.get("active", ""), default=True, file=f"tags.csv line {lineno}")

            img_path = logos_dir / file
            if not img_path.exists():
                raise LibraryError(
                    f"tags.csv line {lineno}: master image not found for {file!r} "
                    f"(expected {img_path})"
                )

            entries.append(
                LogoEntry(
                    file=file,
                    name=name,
                    industries=industries,
                    types=types,
                    tier=tier,
                    year=year,
                    active=active,
                    notes=(row.get("notes") or "").strip(),
                    path=img_path,
                )
            )

    if not entries:
        raise LibraryError(f"tags.csv for profile {profile!r} has no rows")

    return Library(profile=profile, root=root, logos_dir=logos_dir, entries=entries)
