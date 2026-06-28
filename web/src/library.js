// Parse + validate a profile's tags.csv (mirrors engine/library.py). Loud on
// unknown vocab, bad tiers, duplicates, or empties — the library is the source
// of truth, so we stop here if it's wrong.

import { parseCSV } from "./csv.js";
import { normalizeIndustry, normalizeType } from "./vocab.js";

const REQUIRED = ["file", "name", "industries", "types", "tier"];
const TRUE = new Set(["true", "1", "yes", "y", "t"]);
const FALSE = new Set(["false", "0", "no", "n", "f", ""]);

function splitList(raw) {
  return (raw || "").split("|").map((s) => s.trim()).filter(Boolean);
}

export function parseLibrary(csvText) {
  const { header, records } = parseCSV(csvText);
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`tags.csv missing column(s): ${missing.join(", ")}`);

  const entries = [];
  const seen = new Set();
  records.forEach((row, idx) => {
    const line = idx + 2;
    const file = (row.file || "").trim();
    if (!file) throw new Error(`tags.csv line ${line}: empty 'file'`);
    if (seen.has(file)) throw new Error(`tags.csv line ${line}: duplicate file '${file}'`);
    seen.add(file);

    const name = (row.name || "").trim();
    if (!name) throw new Error(`tags.csv line ${line} (${file}): empty 'name'`);

    const rawInds = splitList(row.industries);
    const rawTyps = splitList(row.types);
    if (!rawInds.length) throw new Error(`tags.csv line ${line} (${file}): no industries`);
    if (!rawTyps.length) throw new Error(`tags.csv line ${line} (${file}): no types`);

    let industries, types;
    try {
      industries = rawInds.map(normalizeIndustry);
      types = rawTyps.map(normalizeType);
    } catch (e) {
      throw new Error(`tags.csv line ${line} (${file}): ${e.message}`);
    }

    const tier = parseInt(row.tier, 10);
    if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
      throw new Error(`tags.csv line ${line} (${file}): tier must be 1–5, got '${row.tier}'`);
    }

    const yearRaw = (row.year || "").trim();
    const year = yearRaw ? parseInt(yearRaw, 10) : null;

    const activeRaw = (row.active || "").trim().toLowerCase();
    let active = true;
    if (TRUE.has(activeRaw)) active = true;
    else if (FALSE.has(activeRaw)) active = activeRaw === "" ? true : false;
    else throw new Error(`tags.csv line ${line} (${file}): invalid 'active' = '${row.active}'`);

    entries.push({ file, name, industries, types, tier, year, active, notes: row.notes || "" });
  });

  if (!entries.length) throw new Error("tags.csv has no rows");
  return entries;
}

export function activeEntries(entries) {
  return entries.filter((e) => e.active);
}

export function matches(entry, industries, types, matchAll) {
  const checks = [];
  if (industries.length) checks.push(industries.some((i) => entry.industries.includes(i)));
  if (types.length) checks.push(types.some((t) => entry.types.includes(t)));
  if (!checks.length) return true;
  return matchAll ? checks.every(Boolean) : checks.some(Boolean);
}
