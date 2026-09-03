import type { QueryResult } from "@/engine/types";

/**
 * Parse a CSV string into rows (array of arrays).
 * Handles quoted fields, escaped quotes, NULL values, and Unicode.
 */
export function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  // First pass: split into lines respecting quoted newlines
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = "";
    } else if (ch === '\r') {
      // skip
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  // Parse each line into fields
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inFieldQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inFieldQuotes && i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inFieldQuotes = !inFieldQuotes;
        }
      } else if (ch === ',' && !inFieldQuotes) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseLine);

  return { headers, rows };
}

/**
 * Parse a JSON array of objects into headers and rows.
 */
export function parseJson(content: string): { headers: string[]; rows: (string | null)[][] } {
  const data = JSON.parse(content);
  const arr = Array.isArray(data) ? data : [data];

  if (arr.length === 0) return { headers: [], rows: [] };

  // Collect all unique keys
  const headerSet = new Set<string>();
  for (const obj of arr) {
    if (typeof obj === "object" && obj !== null) {
      for (const key of Object.keys(obj)) {
        headerSet.add(key);
      }
    }
  }
  const headers = Array.from(headerSet);

  // Build rows
  const rows = arr.map((obj: Record<string, unknown>) =>
    headers.map(h => {
      const val = obj?.[h];
      if (val === null || val === undefined) return null;
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    })
  );

  return { headers, rows };
}

/**
 * Convert QueryResult rows to CSV string (with headers).
 * Preserves NULL values, Unicode, and duplicate column names.
 */
export function resultToCsv(result: QueryResult): string {
  const escapeCsvField = (val: string | number | boolean | null | Record<string, unknown>): string => {
    if (val === null || val === undefined) return "";
    const s = typeof val === "object" ? JSON.stringify(val) : String(val);
    // Quote fields that contain commas, quotes, or newlines
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = result.columns.map(escapeCsvField).join(',');
  const dataLines = result.rows.map(row => row.map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Convert QueryResult rows to JSON string.
 * Preserves NULL values, Unicode, and duplicate column names.
 */
export function resultToJson(result: QueryResult): string {
  const objects = result.rows.map(row => {
    const obj: Record<string, string | number | boolean | null> = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i] as string | number | boolean | null;
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
