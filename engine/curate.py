"""Filter and rank the library down to the best N for a query.

Curation order (per spec §8): ``tier`` ascending (1 = flagship), then
``year`` descending (newer wins ties), then original file order for a stable
result. Inactive entries are dropped before ranking.
"""

from __future__ import annotations

from dataclasses import dataclass

from .library import Library, LogoEntry


@dataclass
class Query:
    industries: list[str]
    types: list[str]
    match_all: bool = False

    def describe(self) -> str:
        parts: list[str] = []
        if self.industries:
            parts.append("/".join(self.industries))
        if self.types:
            parts.append("/".join(self.types))
        if not parts:
            return "everything"
        joiner = " AND " if self.match_all else " or "
        return joiner.join(parts)


def _sort_key(item: tuple[int, LogoEntry]):
    idx, e = item
    # year missing sorts last among equal tiers (treat as very old).
    year = e.year if e.year is not None else -1
    return (e.tier, -year, idx)


def curate(library: Library, query: Query, count: int | None = None) -> list[LogoEntry]:
    """Return matching, active entries ranked best-first, capped at ``count``."""
    matched = [
        e
        for e in library.active_entries()
        if e.matches(query.industries, query.types, query.match_all)
    ]
    ranked = [e for _, e in sorted(enumerate(matched), key=_sort_key)]
    if count is not None and count >= 0:
        return ranked[:count]
    return ranked
