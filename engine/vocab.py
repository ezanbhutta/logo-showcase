"""Controlled vocabulary for industries and logo types.

Both lists are *extend-only*. The engine validates every tag against these
values on load and errors on anything unknown, which stops drift like
``construction`` vs ``Construction`` vs ``constructions``.

Aliases let a few common synonyms resolve to a canonical value (e.g.
``monogram`` -> ``lettermark``). Add new aliases here, never new canonical
type values.
"""

from __future__ import annotations

# --- Industry vocabulary (starter set — extend as needed) -------------------

INDUSTRIES: tuple[str, ...] = (
    "construction",
    "real-estate",
    "architecture-interior",
    "finance-banking",
    "insurance",
    "technology-saas",
    "ai-data",
    "ecommerce-retail",
    "fashion-apparel",
    "beauty-cosmetics",
    "health-medical",
    "fitness-wellness",
    "food-beverage",
    "hospitality-travel",
    "education",
    "professional-services",
    "legal",
    "marketing-agency",
    "logistics-transport",
    "automotive",
    "industrial-manufacturing",
    "energy",
    "marine",
    "agriculture",
    "kids",
    "sports",
    "media-entertainment",
    "nonprofit",
)

# --- Type vocabulary (canonical logo taxonomy — fixed 7) --------------------

TYPES: tuple[str, ...] = (
    "wordmark",
    "lettermark",
    "pictorial",
    "abstract",
    "mascot",
    "combination",
    "emblem",
)

# --- Aliases (resolve to a canonical value) ---------------------------------

INDUSTRY_ALIASES: dict[str, str] = {}

TYPE_ALIASES: dict[str, str] = {
    "monogram": "lettermark",
}

INDUSTRY_SET = set(INDUSTRIES)
TYPE_SET = set(TYPES)


class VocabError(ValueError):
    """Raised when a tag value is not in the controlled vocabulary."""


def _suggest(value: str, options: tuple[str, ...]) -> str:
    """Best-effort 'did you mean' hint based on simple prefix/substring match."""
    v = value.lower()
    hits = [o for o in options if o.startswith(v[:3])] or [o for o in options if v in o]
    return f" Did you mean: {', '.join(hits[:3])}?" if hits else ""


def normalize_industry(value: str) -> str:
    """Return the canonical industry for ``value`` or raise ``VocabError``."""
    v = value.strip().lower()
    v = INDUSTRY_ALIASES.get(v, v)
    if v not in INDUSTRY_SET:
        raise VocabError(f"unknown industry {value!r}.{_suggest(v, INDUSTRIES)}")
    return v


def normalize_type(value: str) -> str:
    """Return the canonical logo type for ``value`` or raise ``VocabError``."""
    v = value.strip().lower()
    v = TYPE_ALIASES.get(v, v)
    if v not in TYPE_SET:
        raise VocabError(f"unknown type {value!r}.{_suggest(v, TYPES)}")
    return v
