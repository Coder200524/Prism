const FORMULA_PREFIXES = ["=", "+", "-", "@"] as const;

export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded =
    raw.length > 0 && FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix))
      ? `'${raw}`
      : raw;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replaceAll('"', '""')}"`;
  }
  return guarded;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n") + "\n";
}
