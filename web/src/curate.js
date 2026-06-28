// Filter + rank to the best N (mirrors engine/curate.py).
// Order: tier ascending (1 = flagship), then year descending, then file order.

import { activeEntries, matches } from "./library.js";

export function describeQuery(industries, types, matchAll) {
  const parts = [];
  if (industries.length) parts.push(industries.join("/"));
  if (types.length) parts.push(types.join("/"));
  if (!parts.length) return "everything";
  return parts.join(matchAll ? " AND " : " or ");
}

export function curate(entries, { industries = [], types = [], matchAll = false }, count = null) {
  const active = activeEntries(entries);
  const matched = active
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => matches(e, industries, types, matchAll));
  matched.sort((a, b) => {
    if (a.e.tier !== b.e.tier) return a.e.tier - b.e.tier;
    const ay = a.e.year ?? -1, by = b.e.year ?? -1;
    if (ay !== by) return by - ay;
    return a.idx - b.idx;
  });
  const ranked = matched.map((m) => m.e);
  return count != null && count >= 0 ? ranked.slice(0, count) : ranked;
}

export function titleCase(s) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function typeLabel(types) {
  return types.slice(0, 2).map(titleCase).join(", ");
}
