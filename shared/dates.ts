// Document dates → canonical UTC ISO (`YYYY-MM-DDTHH:mm:ss.sssZ`), which Zod's datetime check accepts.
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function utcIso(y: number, mon: number, d: number, h = 0, min = 0, s = 0): string | null {
  if (mon < 0 || mon > 11 || h > 23 || min > 59 || s > 59) return null;
  const dt = new Date(Date.UTC(y, mon, d, h, min, s));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mon || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

function fromOffset(y: number, mon: number, d: number, h: number, min: number, s: number, offset: string | undefined): string | null {
  if (!offset || offset === "Z") return utcIso(y, mon, d, h, min, s);
  const iso = `${y}-${pad(mon + 1)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(s)}${offset}`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Parse common bill-of-lading date formats to ISO UTC. Returns null when ambiguous. */
export function parseDocDate(s: string): string | null {
  const t = s
    .replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, " ")
    .replace(/\b(?:utc|gmt)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  let m = t.match(/(?:^|[^0-9])(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?/);
  if (m) return fromOffset(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, m[7]);

  m = t.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return utcIso(+m[3], mon, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  m = t.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return utcIso(+m[3], mon, +m[2], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return utcIso(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);

  return null;
}
