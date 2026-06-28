"""Core behavior tests for the engine — vocab, library validation, curation.

Run from the repo root:  python -m pytest -q
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from engine import vocab
from engine.curate import Query, curate
from engine.library import LibraryError, LogoEntry, load_library


# --- vocab ------------------------------------------------------------------

def test_known_values_normalize():
    assert vocab.normalize_industry("Construction") == "construction"
    assert vocab.normalize_type("wordmark") == "wordmark"


def test_monogram_alias_resolves_to_lettermark():
    assert vocab.normalize_type("monogram") == "lettermark"


def test_unknown_value_errors_with_suggestion():
    with pytest.raises(vocab.VocabError) as exc:
        vocab.normalize_industry("construciton")
    assert "construction" in str(exc.value)


# --- LogoEntry.matches ------------------------------------------------------

def _entry(industries, types):
    return LogoEntry(file="x.png", name="X", industries=industries, types=types, tier=1)


def test_match_any_only_tests_supplied_axes():
    e = _entry(["construction"], ["abstract"])
    # industry supplied and hits -> match even though type not supplied
    assert e.matches(["construction"], [], match_all=False)
    # industry supplied but misses, no type supplied -> no match
    assert not e.matches(["finance-banking"], [], match_all=False)


def test_match_all_requires_every_supplied_axis():
    e = _entry(["finance-banking"], ["wordmark"])
    assert e.matches(["finance-banking"], ["wordmark"], match_all=True)
    assert not e.matches(["finance-banking"], ["abstract"], match_all=True)


def test_empty_query_matches_everything():
    assert _entry(["construction"], ["abstract"]).matches([], [], match_all=False)


# --- curation order ---------------------------------------------------------

def test_curate_orders_by_tier_then_year():
    entries = [
        LogoEntry("a.png", "A", ["construction"], ["abstract"], tier=2, year=2020),
        LogoEntry("b.png", "B", ["construction"], ["abstract"], tier=1, year=2021),
        LogoEntry("c.png", "C", ["construction"], ["abstract"], tier=2, year=2024),
    ]
    lib = type("L", (), {"active_entries": lambda self: entries})()
    ranked = curate(lib, Query([], []), count=None)
    assert [e.file for e in ranked] == ["b.png", "c.png", "a.png"]


def test_curate_respects_count_cap():
    entries = [
        LogoEntry(f"{i}.png", str(i), ["construction"], ["abstract"], tier=i % 5 + 1)
        for i in range(20)
    ]
    lib = type("L", (), {"active_entries": lambda self: entries})()
    assert len(curate(lib, Query([], []), count=12)) == 12


# --- library validation -----------------------------------------------------

def _profile(tmp_path: Path, csv_text: str, files: list[str]) -> Path:
    logos = tmp_path / "logos"
    logos.mkdir()
    # 1x1 PNG bytes are enough to satisfy the "file exists" check.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082"
    )
    for f in files:
        (logos / f).write_bytes(png)
    (tmp_path / "tags.csv").write_text(textwrap.dedent(csv_text), encoding="utf-8")
    return tmp_path


def test_valid_library_loads(tmp_path):
    p = _profile(
        tmp_path,
        """\
        file,name,industries,types,tier,year,active
        a.png,A,construction,abstract,1,2024,true
        b.png,B,finance-banking,wordmark,2,2023,false
        """,
        ["a.png", "b.png"],
    )
    lib = load_library(p, profile="t")
    assert len(lib.entries) == 2
    assert len(lib.active_entries()) == 1  # b is inactive


def test_unknown_tag_value_fails_loudly(tmp_path):
    p = _profile(
        tmp_path,
        """\
        file,name,industries,types,tier
        a.png,A,banana,abstract,1
        """,
        ["a.png"],
    )
    with pytest.raises(LibraryError) as exc:
        load_library(p, profile="t")
    assert "banana" in str(exc.value)


def test_missing_image_fails_loudly(tmp_path):
    p = _profile(
        tmp_path,
        """\
        file,name,industries,types,tier
        ghost.png,G,construction,abstract,1
        """,
        [],  # no image written
    )
    with pytest.raises(LibraryError) as exc:
        load_library(p, profile="t")
    assert "ghost.png" in str(exc.value)


def test_duplicate_file_fails(tmp_path):
    p = _profile(
        tmp_path,
        """\
        file,name,industries,types,tier
        a.png,A,construction,abstract,1
        a.png,A2,construction,abstract,2
        """,
        ["a.png"],
    )
    with pytest.raises(LibraryError) as exc:
        load_library(p, profile="t")
    assert "duplicate" in str(exc.value)


def test_tier_out_of_range_fails(tmp_path):
    p = _profile(
        tmp_path,
        """\
        file,name,industries,types,tier
        a.png,A,construction,abstract,9
        """,
        ["a.png"],
    )
    with pytest.raises(LibraryError):
        load_library(p, profile="t")
