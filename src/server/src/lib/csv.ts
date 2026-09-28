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

/** RFC4180-ish CSV row parser: quoted fields, escaped quotes, commas inside quotes. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Split CSV text into rows, respecting quoted newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentLine = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      currentLine += ch;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      if (currentLine.trim().length > 0) {
        rows.push(parseCsvLine(currentLine));
      }
      currentLine = "";
      continue;
    }
    currentLine += ch;
  }
  if (currentLine.trim().length > 0) {
    rows.push(parseCsvLine(currentLine));
  }
  return rows;
}

