// Minimal but correct CSV parser (handles quoted fields, commas, escaped quotes,
// CRLF). Returns an array of row objects keyed by the header row.

export function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); field = ""; row = [];
    } else if (c === "\r") {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  // last field/row if file doesn't end in newline
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Drop trailing empty rows.
  while (rows.length && rows[rows.length - 1].every((x) => x.trim() === "")) rows.pop();
  if (!rows.length) return { header: [], records: [] };

  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1)
    .filter((r) => r.some((x) => x.trim() !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
      return o;
    });
  return { header, records };
}
