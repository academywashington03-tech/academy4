// CSV export helpers. Excel-safe (UTF-8 BOM for Arabic) and protected against spreadsheet formula injection.
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // A text cell starting with = + - @ (or control chars) can be executed as a formula by Excel/Sheets.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c.key])).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
