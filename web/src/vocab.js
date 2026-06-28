// Controlled vocabulary — must mirror engine/vocab.py. Extend-only.
// The app rejects unknown values so tags never drift (construction vs Construction).

export const INDUSTRIES = [
  "construction", "real-estate", "architecture-interior", "finance-banking",
  "insurance", "technology-saas", "ai-data", "ecommerce-retail", "fashion-apparel",
  "beauty-cosmetics", "health-medical", "fitness-wellness", "food-beverage",
  "hospitality-travel", "education", "professional-services", "legal",
  "marketing-agency", "logistics-transport", "automotive", "industrial-manufacturing",
  "energy", "marine", "agriculture", "kids", "sports", "media-entertainment", "nonprofit",
];

export const TYPES = [
  "wordmark", "lettermark", "pictorial", "abstract", "mascot", "combination", "emblem",
];

const INDUSTRY_ALIASES = {};
const TYPE_ALIASES = { monogram: "lettermark" };

const INDUSTRY_SET = new Set(INDUSTRIES);
const TYPE_SET = new Set(TYPES);

function suggest(value, options) {
  const v = value.toLowerCase();
  const hits = options.filter((o) => o.startsWith(v.slice(0, 3)));
  return hits.length ? ` Did you mean: ${hits.slice(0, 3).join(", ")}?` : "";
}

export function normalizeIndustry(value) {
  let v = String(value).trim().toLowerCase();
  v = INDUSTRY_ALIASES[v] || v;
  if (!INDUSTRY_SET.has(v)) {
    throw new Error(`unknown industry '${value}'.${suggest(v, INDUSTRIES)}`);
  }
  return v;
}

export function normalizeType(value) {
  let v = String(value).trim().toLowerCase();
  v = TYPE_ALIASES[v] || v;
  if (!TYPE_SET.has(v)) {
    throw new Error(`unknown type '${value}'.${suggest(v, TYPES)}`);
  }
  return v;
}
