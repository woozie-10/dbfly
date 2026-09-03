/**
 * Centralized type-aware formatter for DuckDB-Wasm query results.
 *
 * ONE function — formatCellValue(rawValue, meta) — handles every DuckDB type.
 * Uses the DuckDB SQL type metadata (not JavaScript value type) to dispatch.
 *
 * Each type handler reads the raw Arrow value using the appropriate method
 * and formats it as a display-ready string or structured object.
 */

import type { ColumnMeta, DuckDBBaseType } from "./column-meta";

/** Value type that can be stored in a result cell */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CellValue = string | number | boolean | null | Record<string, any>;

// ═══════════════════════════════════════════════════════════════════════════════
// Single entry point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a raw DuckDB/Arrow value into a display-ready cell value.
 *
 * @param rawValue - The raw value from Arrow vector.get(index)
 * @param meta - Column metadata (DuckDB type, Arrow type properties)
 * @returns Formatted value for display in the results table
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatCellValue(rawValue: any, meta: ColumnMeta): CellValue {
  if (rawValue == null) return null;

  switch (meta.baseType) {
    case "BOOLEAN":     return fmtBoolean(rawValue);
    case "TINYINT":
    case "SMALLINT":
    case "INTEGER":     return fmtInteger(rawValue);
    case "BIGINT":
    case "UTINYINT":
    case "USMALLINT":
    case "UINTEGER":
    case "UBIGINT":     return fmtBigInt(rawValue);
    case "HUGEINT":
    case "UHUGEINT":    return fmtHugeint(rawValue);
    case "FLOAT":
    case "DOUBLE":      return fmtFloat(rawValue);
    case "DECIMAL":     return fmtDecimal(rawValue, meta);
    case "VARCHAR":
    case "CHAR":        return fmtVarchar(rawValue);
    case "BLOB":        return fmtBlob(rawValue);
    case "DATE":        return fmtDate(rawValue);
    case "TIME":        return fmtTime(rawValue, meta);
    case "TIMESTAMPTZ":
    case "TIMESTAMP_S":
    case "TIMESTAMP_MS":
    case "TIMESTAMP_US":
    case "TIMESTAMP_NS": return fmtTimestamp(rawValue, meta);
    case "INTERVAL":    return fmtInterval(rawValue);
    case "UUID":        return fmtUuid(rawValue);
    case "JSON":        return fmtJson(rawValue);
    case "STRUCT":      return fmtStruct(rawValue);
    case "MAP":         return fmtMap(rawValue);
    case "ARRAY":       return fmtArray(rawValue);
    default:            return fmtDefault(rawValue);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type-specific formatters
// ═══════════════════════════════════════════════════════════════════════════════

function fmtBoolean(val: unknown): boolean {
  return !!val;
}

function fmtInteger(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return Number(val);
}

function fmtBigInt(val: unknown): string {
  // DuckDB BIGINT/UBIGINT → Arrow returns BigInt
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val;
  return String(val);
}

function fmtHugeint(val: unknown): string {
  // DuckDB HUGEINT (INT128) — may come as BigInt, string, or Decimal object
  if (typeof val === "bigint") return val.toString();
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  // Arrow Decimal128 object with scale=0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.scale === "bigint") return obj.scale.toString();
    try { return typeof obj.toJSON === "function" ? String(obj.toJSON()) : String(val); } catch { return String(val); }
  }
  return String(val);
}

function fmtFloat(val: unknown): number {
  if (typeof val === "number") return val;
  return Number(val);
}

/**
 * DECIMAL — the critical formatter.
 *
 * DuckDB DECIMAL stores unscaled integers in Arrow. The scale factor comes
 * from the Arrow Decimal type (meta.arrowType.scale).
 *
 * Arrow Decimal values from vec.get(r) can be:
 *   - BigInt (unscaled integer) — most common
 *   - Number (small unscaled integer)
 *   - String (rare, but possible from some Arrow implementations)
 *   - Arrow Decimal instance (object with .scale as BigInt)
 *
 * We ALWAYS convert to string arithmetic to preserve exact precision.
 */
function fmtDecimal(val: unknown, meta: ColumnMeta): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scale: number = Number((meta.arrowType as any)?.scale ?? 0);

  /** Insert decimal point into an integer string at position `s` */
  function scaledInt(rawStr: string, s: number): string {
    const isNeg = rawStr[0] === "-";
    let digits = isNeg ? rawStr.slice(1) : rawStr;
    // Pad with leading zeros if needed
    while (digits.length <= s) digits = "0" + digits;
    const intPart = digits.slice(0, digits.length - s);
    const decPart = digits.slice(digits.length - s);
    if (s === 0) return (isNeg ? "-" : "") + intPart;
    return (isNeg ? "-" : "") + intPart + "." + decPart;
  }

  // Case 1: BigInt (the standard Arrow Decimal vector.get() return type)
  if (typeof val === "bigint") {
    return scaledInt(val.toString(), scale);
  }

  // Case 2: Number (small unscaled integer from Arrow)
  if (typeof val === "number") {
    // Convert to unscaled BigInt string via rounding, then apply scale
    if (scale > 0) {
      const unscaled = Math.round(val * Math.pow(10, scale));
      return scaledInt(String(unscaled), scale);
    }
    return String(Math.round(val));
  }

  // Case 3: String — may be raw unscaled integer or already formatted
  if (typeof val === "string") {
    let str = val.trim();
    // Strip wrapping quotes
    while (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1).trim();
    }
    // Already has decimal point → already formatted
    if (/^-?\d+\.\d+$/.test(str)) return str;
    // Raw unscaled integer string → apply scale
    if (/^-?\d+$/.test(str)) return scaledInt(str, scale);
    // Try as number (handles scientific notation)
    const num = Number(str);
    if (!isNaN(num)) {
      const unscaled = Math.round(num * Math.pow(10, scale));
      return scaledInt(String(unscaled), scale);
    }
    return str;
  }

  // Case 4: Arrow Decimal instance (object with .scale as BigInt = unscaled value)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.scale === "bigint") {
      return scaledInt(obj.scale.toString(), scale);
    }
    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        return fmtDecimal(json, meta);
      } catch { /* fall through */ }
    }
    return String(val);
  }

  return String(val);
}

/**
 * VARCHAR — DuckDB stores JSON as VARCHAR/Utf8 in Arrow,
 * so we can't distinguish from the type alone.
 * Try parsing values that look like JSON objects/arrays.
 */
function fmtVarchar(val: unknown): CellValue {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {
        // not valid JSON — return as-is
      }
    }
    return val;
  }
  return String(val);
}

/**
 * BLOB — display as hex dump with byte count.
 */
function fmtBlob(val: unknown): string {
  if (val instanceof Uint8Array || val instanceof Int8Array) {
    const hex = Array.from(val).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    return `BLOB (${val.length} bytes)\n${hex}`;
  }
  if (Array.isArray(val)) {
    const bytes = val.map((b) => Number(b));
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    return `BLOB (${bytes.length} bytes)\n${hex}`;
  }
  if (typeof val === "string") {
    // Comma-separated decimal bytes
    const parts = val.split(",");
    if (parts.length > 1 && parts.every((p) => /^\d+$/.test(p.trim()))) {
      const bytes = parts.map((p) => parseInt(p.trim(), 10));
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      return `BLOB (${bytes.length} bytes)\n${hex}`;
    }
    return val;
  }
  return String(val);
}

/**
 * DATE — Arrow stores as epoch days (number) or Date object.
 */
function fmtDate(val: unknown): string {
  if (val instanceof Date) {
    return formatMsAsDate(val.getTime());
  }
  if (typeof val === "bigint") {
    // BigInt epoch days → convert to ms, then format
    return formatMsAsDate(Number(val) * 86400000);
  }
  if (typeof val === "number") {
    // Arrow Date type can return epoch days (small) or epoch ms (large)
    // Auto-detect based on magnitude:
    //   epoch days for year 2000-2100: ~7,300 – ~54,000
    //   epoch ms for year 2000-2100:  ~9.5e11 – ~4.1e12
    const abs = Math.abs(val);
    if (abs > 1e9) {
      // Likely epoch ms or seconds — treat as ms
      return formatMsAsDate(val > 1e10 ? val : val * 1000);
    }
    // Likely epoch days
    return formatMsAsDate(val * 86400000);
  }
  return String(val);
}

/**
 * TIME — Arrow stores as microseconds (bigint) or number.
 * Use arrowType.unit to determine the source unit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtTime(val: unknown, _meta: ColumnMeta): string {
  if (val instanceof Date) {
    const h = pad2(val.getUTCHours());
    const min = pad2(val.getUTCMinutes());
    const s = pad2(val.getUTCSeconds());
    return `${h}:${min}:${s}`;
  }

  // Auto-detect time unit from value magnitude (reliable, doesn't depend on schema)
  // DuckDB internally stores TIME as microseconds since midnight.
  // For 14:30:45 (=52245 seconds):
  //   microseconds: ~5.2e13
  //   milliseconds: ~5.2e7
  //   nanoseconds:  ~5.2e16
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const numVal = val as any as number | bigint;
  const abs = typeof numVal === "bigint" ? Number(numVal < BigInt(0) ? -numVal : numVal) : Math.abs(numVal);
  let rawUs: number;
  if (abs > 1e15) {
    // nanoseconds
    rawUs = typeof numVal === "bigint"
      ? Number(numVal / BigInt(1000))
      : numVal / 1000;
  } else if (abs > 1e8) {
    // microseconds (DuckDB default)
    rawUs = typeof numVal === "bigint" ? Number(numVal) : numVal;
  } else {
    // milliseconds or small value — assume microseconds if very small
    rawUs = typeof numVal === "bigint" ? Number(numVal) * 1000 : numVal * 1000;
  }

  return formatUsAsTime(rawUs);
}

/**
 * TIMESTAMP — handles TIMESTAMP, TIMESTAMP_S/MS/NS, TIMESTAMPTZ.
 *
 * Arrow stores timestamps as a number or BigInt in the unit specified
 * by arrowType.unit ("second", "millisecond", "microsecond", "nanosecond").
 *
 * We convert to milliseconds for Date formatting, handling BigInt overflow
 * for nanosecond timestamps that exceed Number.MAX_SAFE_INTEGER.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtTimestamp(val: unknown, meta: ColumnMeta): string {
  if (val instanceof Date) {
    return formatMsAsTimestamp(val.getTime(), meta.baseType === "TIMESTAMPTZ");
  }

  const hasTz = meta.baseType === "TIMESTAMPTZ";
  const isNs = meta.baseType === "TIMESTAMP_NS";

  // ── BigInt value (common for TIMESTAMP_NS from DuckDB-Wasm) ────────
  if (typeof val === "bigint") {
    const abs = val < BigInt(0) ? -val : val;
    if (isNs) {
      // Always use nanosecond formatter for TIMESTAMP_NS
      return formatNsAsTimestamp(val, hasTz);
    }
    if (abs > BigInt(Number.MAX_SAFE_INTEGER)) {
      // Too large for Number — detect unit from magnitude
      if (abs >= BigInt("900000000000000") && abs <= BigInt("5000000000000000")) {
        const msBigInt = val / BigInt(1000);
        return formatMsAsTimestamp(Number(msBigInt), hasTz);
      }
      return formatMsAsTimestamp(Number(val), hasTz);
    }
    // Safe integer range — same auto-detect as number path
    const numAbs = Number(abs);
    let ms: number;
    if (numAbs >= 9e14 && numAbs <= 5e15) {
      ms = Number(val) / 1000;
    } else if (numAbs >= 9e11 && numAbs <= 5e12) {
      ms = Number(val);
    } else if (numAbs >= 9e8 && numAbs <= 5e9) {
      ms = Number(val) * 1000;
    } else {
      ms = Number(val) / 1000;
    }
    return formatMsAsTimestamp(ms, hasTz);
  }

  // ── Number value ──────────────────────────────────────────────────────
  if (typeof val === "number") {
    if (isNs) {
      // DuckDB-Wasm may return nanosecond timestamps as Number (precision loss).
      // Convert to BigInt and use nanosecond formatter.
      return formatNsAsTimestamp(BigInt(Math.round(val)), hasTz);
    }
    // Auto-detect unit from magnitude
    const abs = Math.abs(val);
    let ms: number;
    if (abs >= 9e14 && abs <= 5e15) {
      ms = val / 1000;
    } else if (abs >= 9e11 && abs <= 5e12) {
      ms = val;
    } else if (abs >= 9e8 && abs <= 5e9) {
      ms = val * 1000;
    } else {
      ms = val / 1000;
    }
    return formatMsAsTimestamp(ms, hasTz);
  }

  return String(val);
}

/**
 * INTERVAL — DuckDB INTERVAL stores as Arrow IntervalDayNano.
 *
 * Arrow returns intervals in various forms:
 *   - Object with .months, .days, .nanoseconds properties
 *   - BigInt pair [packed_month_day, nanoseconds]
 *   - String "months,days" or "packed,nanos" (from some Arrow builds)
 *   - Plain object with indexed access [0] and [1]
 */
function fmtInterval(val: unknown): string {
  if (val == null) return "";

  /** Decode packed month_day + nanos into readable interval string */
  function decode(packed: bigint, nanos: bigint): string {
    const months = Number((packed >> BigInt(32)) & BigInt(0xFFFFFFFF));
    const days = Number(packed & BigInt(0xFFFFFFFF));
    const totalSec = Number(nanos / BigInt(1000000000));
    return formatIntervalFromParts(months, days, totalSec);
  }

  /** Read Int32Array buffer as interval components */
  function decodeInt32Array(arr: Int32Array): string {
    // DuckDB-Wasm returns IntervalDayNano as Int32Array.
    // Arrow stores it as two int64s: [packed_month_day, nanoseconds]
    // That's 16 bytes = 4 int32 values.
    //
    // CRITICAL: The Int32Array may be a SUBARRAY view — its .length may
    // be less than 4, but the underlying .buffer has all 16 bytes.
    // Always read from .buffer at .byteOffset to get the full value.
    //
    // Layout (little-endian):
    //   [0] = lower 32 bits of packed_month_day (= days)
    //   [1] = upper 32 bits of packed_month_day (= months)
    //   [2] = lower 32 bits of nanoseconds
    //   [3] = upper 32 bits of nanoseconds
    try {
      const view = new DataView(arr.buffer, arr.byteOffset, Math.max(arr.byteLength, 16));
      const days = view.getInt32(0, true);
      const months = view.getInt32(4, true);
      const nanosLo = view.getUint32(8, true);
      const nanosHi = view.getInt32(12, true);
      const nanos = BigInt(nanosHi) * BigInt(4294967296) + BigInt(nanosLo);
      const totalSec = Number(nanos / BigInt(1000000000));
      return formatIntervalFromParts(months, days, totalSec);
    } catch {
      // Fallback: use array elements directly
      if (arr.length >= 4) {
        const days = arr[0];
        const months = arr[1];
        const nanosLo = arr[2] >>> 0;
        const nanosHi = arr[3];
        const nanos = BigInt(nanosHi) * BigInt(4294967296) + BigInt(nanosLo);
        const totalSec = Number(nanos / BigInt(1000000000));
        return formatIntervalFromParts(months, days, totalSec);
      }
      return String(Array.from(arr));
    }
  }

  // ── TypedArray detection (cross-realm safe) ──
  // DuckDB-Wasm runs in a Worker, so instanceof Int32Array may fail.
  // Use duck-typing: check for .buffer (ArrayBuffer) and .byteOffset properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = val as any;
  if (
    v && typeof v === "object" &&
    v.buffer instanceof ArrayBuffer &&
    typeof v.byteOffset === "number"
  ) {
    // Read directly from the underlying ArrayBuffer
    try {
      const view = new DataView(v.buffer, v.byteOffset, Math.max(v.byteLength, 16));
      const days = view.getInt32(0, true);
      const months = view.getInt32(4, true);
      const nanosLo = view.getUint32(8, true);
      const nanosHi = view.getInt32(12, true);
      const nanos = BigInt(nanosHi) * BigInt(4294967296) + BigInt(nanosLo);
      const totalSec = Number(nanos / BigInt(1000000000));
      return formatIntervalFromParts(months, days, totalSec);
    } catch {
      // fallback
    }
  }

  // ── String: comma-separated ──
  if (typeof val === "string") {
    const parts = val.split(",").map((s) => s.trim());
    if (parts.length === 2 && parts.every((p) => /^-?\d+$/.test(p))) {
      return decode(BigInt(parts[0]), BigInt(parts[1]));
    }
    return val;
  }

  // ── BigInt — raw packed value ──
  if (typeof val === "bigint") {
    return val.toString();
  }

  // ── Plain Array: [packed, nanos] ──
  if (Array.isArray(val) && val.length === 2) {
    try { return decode(BigInt(String(val[0])), BigInt(String(val[1]))); }
    catch { return String(val); }
  }

  // ── Object with named properties ──
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;

    if ("months" in obj || "days" in obj || "nanoseconds" in obj) {
      try {
        const months = Number(obj.months ?? 0);
        const days = Number(obj.days ?? 0);
        const nanos = BigInt(String(obj.nanoseconds ?? 0));
        const totalSec = Number(nanos / BigInt(1000000000));
        return formatIntervalFromParts(months, days, totalSec);
      } catch { return String(val); }
    }

    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        if (json !== val) return fmtInterval(json);
      } catch { /* fall through */ }
    }

    return String(val);
  }

  return String(val);
}

/**
 * UUID — Arrow stores as FixedSizeBinary(16) → Uint8Array(16).
 */
function fmtUuid(val: unknown): string {
  if (val instanceof Uint8Array) {
    const hex = Array.from(val).map((b) => b.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
      hex.slice(16, 20), hex.slice(20, 32),
    ].join("-");
  }
  return String(val);
}

/**
 * JSON — DuckDB stores JSON as VARCHAR. The Arrow value may be:
 *   - Already a JS object (from Arrow proxy)
 *   - A plain JSON string
 *   - An escaped/quoted string from Arrow serialization
 *
 * Returns a parsed JS object for rendering.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtJson(val: unknown): Record<string, unknown> | string {
  if (val == null) return "";
  if (typeof val === "object" && val !== null) {
    return val as Record<string, unknown>;
  }
  if (typeof val !== "string") return String(val);

  let str: string = val;

  // Strip ALL layers of wrapping double quotes
  let prev = "";
  while (str !== prev) {
    prev = str;
    str = str.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
  }

  // Unescape doubled quotes (CSV-style: "" → ")
  str = str.replace(/""/g, '"');
  // Unescape backslash quotes (JSON-style: \" → ")
  if (str.includes('\\"')) {
    str = str.replace(/\\"/g, '"');
  }

  // Try JSON.parse
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return String(parsed);
  } catch { /* parse failed */ }

  // Fallback: try more aggressive unescaping for { } / [ ] strings
  if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
    try {
      const parsed = JSON.parse(str.replace(/\\\\/g, "\\"));
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch { /* still fails */ }
  }

  return str;
}

/**
 * STRUCT — Arrow returns StructRowProxy (Proxy object with field access).
 * Use toJSON() to get a plain JS object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtStruct(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === "object" && val !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = val as any;
    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        if (typeof json === "object" && json !== null) return json;
      } catch { /* fall through */ }
    }
    // Try reading known fields from the object
    try {
      const result: Record<string, unknown> = {};
      const keys = Object.keys(obj).filter((k) => !k.startsWith("__"));
      for (const k of keys) {
        result[k] = obj[k];
      }
      if (Object.keys(result).length > 0) return result;
    } catch { /* fall through */ }
    return val as Record<string, unknown>;
  }
  return { value: val };
}

/**
 * MAP — Arrow returns MapRow or similar proxy.
 * Use toJSON() to get a plain JS object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtMap(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === "object" && val !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = val as any;
    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        if (typeof json === "object" && json !== null) return json;
      } catch { /* fall through */ }
    }
    // DuckDB Map may return as {key: value} pairs
    return obj as Record<string, unknown>;
  }
  return { value: val };
}

/**
 * ARRAY (List) — Arrow returns ArrayProxy or plain array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtArray(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object" && val !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = val as any;
    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        if (Array.isArray(json)) return json;
        return [json];
      } catch { /* fall through */ }
    }
    // Try to spread as array-like
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = Array.from(val as any);
      return arr;
    } catch { /* fall through */ }
  }
  return [val];
}

function fmtDefault(val: unknown): CellValue {
  if (typeof val === "object" && val !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = val as any;
    if (typeof obj.toJSON === "function") {
      try {
        const json = obj.toJSON();
        if (typeof json === "object" && json !== null) return json;
      } catch { /* fall through */ }
    }
  }
  if (typeof val === "bigint") return val.toString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return val as any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unit conversion helpers
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * Unit conversion helpers removed — timestamps now use auto-detect
 * from value magnitude, which is reliable for DuckDB-Wasm.
 * DuckDB internally always uses microseconds for timestamps.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Date/time formatting
// ═══════════════════════════════════════════════════════════════════════════════

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function formatMsAsDate(ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatMsAsTimestamp(ms: number, hasTz: boolean): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(ms);
  const date = formatMsAsDate(ms);
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  const ms3 = pad3(d.getUTCMilliseconds());
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() || d.getUTCMilliseconds();
  if (!hasTime) return date;
  const ts = `${date} ${h}:${min}:${s}.${ms3}`;
  return hasTz ? `${ts} UTC` : ts;
}

/**
 * Format a nanosecond timestamp directly without Date.
 * Preserves full nanosecond precision.
 */
function formatNsAsTimestamp(ns: bigint, hasTz: boolean): string {
  // Split into seconds and sub-second nanoseconds
  const sec = ns / BigInt(1_000_000_000);
  const subNs = ns % BigInt(1_000_000_000);
  const secNum = Number(sec);
  // Use Date only for the date/time components (seconds precision is safe)
  const d = new Date(secNum * 1000);
  if (isNaN(d.getTime())) return ns.toString();
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  // Format nanosecond remainder with leading zeros (9 digits)
  const nsStr = subNs.toString().padStart(9, "0");
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() || subNs > BigInt(0);
  if (!hasTime) return date;
  const ts = `${date} ${h}:${min}:${s}.${nsStr}`;
  return hasTz ? `${ts} UTC` : ts;
}

function formatUsAsTime(us: number): string {
  const totalSec = Math.floor(Math.abs(us) / 1_000_000);
  const h = pad2(Math.floor(totalSec / 3600));
  const min = pad2(Math.floor((totalSec % 3600) / 60));
  const s = pad2(totalSec % 60);
  const fracUs = Math.abs(us) % 1_000_000;
  if (fracUs === 0) return `${h}:${min}:${s}`;
  const fracMs = pad3(Math.floor(fracUs / 1000));
  return `${h}:${min}:${s}.${fracMs}`;
}

function formatIntervalFromParts(months: number, days: number, totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts: string[] = [];
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  if (secs || parts.length === 0) parts.push(`${secs} ${secs === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}
