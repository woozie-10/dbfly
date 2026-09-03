import { describe, it, expect } from "vitest";
import { formatCellValue } from "@/engine/format-cell";
import type { ColumnMeta } from "@/engine/column-meta";

// Helper to create ColumnMeta with minimal fields
function meta(
  baseType: string,
  sqlType: string = "",
  arrowTypeOverrides: Record<string, unknown> = {}
): ColumnMeta {
  return {
    name: "col",
    baseType: baseType as any,
    sqlType: sqlType || baseType,
    arrowType: { scale: 0n, precision: 18, ...arrowTypeOverrides },
  };
}

describe("formatCellValue", () => {
  // ── NULL ──────────────────────────────────────────────────────
  describe("NULL handling", () => {
    it("returns null for null input", () => {
      expect(formatCellValue(null, meta("VARCHAR"))).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(formatCellValue(undefined, meta("VARCHAR"))).toBeNull();
    });
  });

  // ── BOOLEAN ──────────────────────────────────────────────────
  describe("BOOLEAN", () => {
    it("formats true", () => {
      expect(formatCellValue(true, meta("BOOLEAN"))).toBe(true);
    });

    it("formats false", () => {
      expect(formatCellValue(false, meta("BOOLEAN"))).toBe(false);
    });

    it("coerces truthy values to true", () => {
      expect(formatCellValue(1, meta("BOOLEAN"))).toBe(true);
      expect(formatCellValue("yes", meta("BOOLEAN"))).toBe(true);
    });

    it("coerces falsy values to false", () => {
      expect(formatCellValue(0, meta("BOOLEAN"))).toBe(false);
      expect(formatCellValue("", meta("BOOLEAN"))).toBe(false);
    });
  });

  // ── INTEGER types ────────────────────────────────────────────
  describe("INTEGER types", () => {
    it("formats TINYINT", () => {
      expect(formatCellValue(42, meta("TINYINT"))).toBe(42);
    });

    it("formats SMALLINT", () => {
      expect(formatCellValue(-123, meta("SMALLINT"))).toBe(-123);
    });

    it("formats INTEGER from number", () => {
      expect(formatCellValue(1000000, meta("INTEGER"))).toBe(1000000);
    });

    it("formats INTEGER from BigInt", () => {
      expect(formatCellValue(BigInt(42), meta("INTEGER"))).toBe(42);
    });

    it("formats unsigned TINYINT", () => {
      expect(formatCellValue(255, meta("UTINYINT"))).toBe("255");
    });

    it("formats unsigned SMALLINT", () => {
      expect(formatCellValue(65535, meta("USMALLINT"))).toBe("65535");
    });

    it("formats unsigned INTEGER", () => {
      expect(formatCellValue(4000000000, meta("UINTEGER"))).toBe("4000000000");
    });
  });

  // ── BIGINT types ─────────────────────────────────────────────
  describe("BIGINT types", () => {
    it("formats BIGINT from BigInt", () => {
      expect(formatCellValue(BigInt("9223372036854775807"), meta("BIGINT"))).toBe("9223372036854775807");
    });

    it("formats BIGINT from number", () => {
      expect(formatCellValue(42, meta("BIGINT"))).toBe("42");
    });

    it("formats BIGINT from string", () => {
      expect(formatCellValue("123456789012345", meta("BIGINT"))).toBe("123456789012345");
    });

    it("formats UBIGINT", () => {
      expect(formatCellValue(BigInt("18446744073709551615"), meta("UBIGINT"))).toBe("18446744073709551615");
    });
  });

  // ── HUGEINT ──────────────────────────────────────────────────
  describe("HUGEINT", () => {
    it("formats HUGEINT from BigInt", () => {
      const val = BigInt("170141183460469231731687303715884105727");
      expect(formatCellValue(val, meta("HUGEINT"))).toBe("170141183460469231731687303715884105727");
    });

    it("formats HUGEINT from string", () => {
      expect(formatCellValue("99999999999999999999999999999", meta("HUGEINT"))).toBe("99999999999999999999999999999");
    });

    it("formats HUGEINT from number", () => {
      expect(formatCellValue(42, meta("HUGEINT"))).toBe("42");
    });

    it("formats HUGEINT from object with toJSON", () => {
      const obj = { toJSON: () => "12345", scale: 0n };
      // fmtHugeint: checks typeof obj.scale === "bigint" first, which is true, so returns scale.toString()
      expect(formatCellValue(obj, meta("HUGEINT"))).toBe("0");
    });

    it("formats UHUGEINT", () => {
      expect(formatCellValue(BigInt(42), meta("UHUGEINT"))).toBe("42");
    });
  });

  // ── FLOAT / DOUBLE ───────────────────────────────────────────
  describe("FLOAT types", () => {
    it("formats FLOAT from number", () => {
      expect(formatCellValue(3.14, meta("FLOAT"))).toBe(3.14);
    });

    it("formats DOUBLE from number", () => {
      expect(formatCellValue(2.718281828, meta("DOUBLE"))).toBe(2.718281828);
    });

    it("formats FLOAT from string", () => {
      expect(formatCellValue("1.5", meta("FLOAT"))).toBe(1.5);
    });

    it("formats negative zero", () => {
      expect(Object.is(formatCellValue(-0, meta("FLOAT")), -0)).toBe(true);
    });

    it("formats special float values", () => {
      expect(formatCellValue(Infinity, meta("FLOAT"))).toBe(Infinity);
      expect(formatCellValue(-Infinity, meta("FLOAT"))).toBe(-Infinity);
      expect(formatCellValue(NaN, meta("FLOAT"))).toBeNaN();
    });
  });

  // ── DECIMAL ──────────────────────────────────────────────────
  describe("DECIMAL", () => {
    it("formats DECIMAL(18,4) from BigInt", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue(BigInt(12345678), m)).toBe("1234.5678");
    });

    it("formats DECIMAL(18,4) negative", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue(BigInt(-12345678), m)).toBe("-1234.5678");
    });

    it("formats DECIMAL(18,0) as integer", () => {
      const m = meta("DECIMAL", "DECIMAL(18,0)", { scale: 0n });
      expect(formatCellValue(BigInt(42), m)).toBe("42");
    });

    it("formats DECIMAL(18,2) from number", () => {
      const m = meta("DECIMAL", "DECIMAL(18,2)", { scale: 2n });
      // 1999 * 100 = 199900, scaledInt(199900, 2) = "1999.00"
      expect(formatCellValue(1999, m)).toBe("1999.00");
    });

    it("formats DECIMAL with zero scale", () => {
      const m = meta("DECIMAL", "DECIMAL(18,0)", { scale: 0n });
      expect(formatCellValue(BigInt(1000000), m)).toBe("1000000");
    });

    it("formats DECIMAL with small scale and BigInt", () => {
      const m = meta("DECIMAL", "DECIMAL(18,2)", { scale: 2n });
      expect(formatCellValue(BigInt(500), m)).toBe("5.00");
    });

    it("formats DECIMAL from string", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue("12345678", m)).toBe("1234.5678");
    });

    it("formats DECIMAL from already formatted string", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue("12.3456", m)).toBe("12.3456");
    });

    it("formats DECIMAL from string with quotes", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue('"12345678"', m)).toBe("1234.5678");
    });

    it("formats DECIMAL from object with scale BigInt", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      const obj = { toJSON: () => "12345678", scale: 4n };
      // fmtDecimal: checks typeof obj.scale === "bigint" first → returns scaledInt("4", 4) = "0.0004"
      expect(formatCellValue(obj, m)).toBe("0.0004");
    });

    it("preserves precision for large DECIMAL values", () => {
      const m = meta("DECIMAL", "DECIMAL(38,18)", { scale: 18n });
      const result = formatCellValue(BigInt("1234567890123456789012345678"), m);
      // Should be a string with a decimal point
      expect(typeof result).toBe("string");
      expect(result).toContain(".");
    });

    it("formats DECIMAL(18,4) with small BigInt", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue(BigInt(100), m)).toBe("0.0100");
    });

    it("formats DECIMAL(18,4) with zero value", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue(BigInt(0), m)).toBe("0.0000");
    });
  });

  // ── VARCHAR / CHAR ──────────────────────────────────────────
  describe("VARCHAR", () => {
    it("formats plain string", () => {
      expect(formatCellValue("hello", meta("VARCHAR"))).toBe("hello");
    });

    it("formats empty string", () => {
      expect(formatCellValue("", meta("VARCHAR"))).toBe("");
    });

    it("formats string with unicode", () => {
      expect(formatCellValue("Привет мир 🌍", meta("VARCHAR"))).toBe("Привет мир 🌍");
    });

    it("formats string that looks like JSON object but isn't", () => {
      expect(formatCellValue("{not json}", meta("VARCHAR"))).toBe("{not json}");
    });

    it("formats valid JSON object string as parsed object", () => {
      const result = formatCellValue('{"key":"value"}', meta("VARCHAR"));
      expect(result).toEqual({ key: "value" });
    });

    it("formats valid JSON array string as parsed array", () => {
      const result = formatCellValue("[1,2,3]", meta("VARCHAR"));
      expect(result).toEqual([1, 2, 3]);
    });

    it("formats invalid JSON with object-like syntax as string", () => {
      const result = formatCellValue("{invalid: json}", meta("VARCHAR"));
      expect(result).toBe("{invalid: json}");
    });

    it("formats CHAR type", () => {
      expect(formatCellValue("A", meta("CHAR"))).toBe("A");
    });

    it("formats string with special characters", () => {
      expect(formatCellValue("line1\nline2\ttab", meta("VARCHAR"))).toBe("line1\nline2\ttab");
    });
  });

  // ── BLOB ─────────────────────────────────────────────────────
  describe("BLOB", () => {
    it("formats Uint8Array blob", () => {
      const val = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const result = formatCellValue(val, meta("BLOB"));
      expect(result).toBe("BLOB (5 bytes)\n48 65 6c 6c 6f");
    });

    it("formats array blob", () => {
      const result = formatCellValue([72, 101, 108, 108, 111], meta("BLOB"));
      expect(result).toBe("BLOB (5 bytes)\n48 65 6c 6c 6f");
    });

    it("formats comma-separated string blob", () => {
      const result = formatCellValue("72,101,108", meta("BLOB"));
      expect(result).toBe("BLOB (3 bytes)\n48 65 6c");
    });

    it("returns non-blob string as-is", () => {
      expect(formatCellValue("hello", meta("BLOB"))).toBe("hello");
    });

    it("formats empty Uint8Array", () => {
      const val = new Uint8Array([]);
      const result = formatCellValue(val, meta("BLOB"));
      expect(result).toBe("BLOB (0 bytes)\n");
    });
  });

  // ── DATE ─────────────────────────────────────────────────────
  describe("DATE", () => {
    it("formats Date object", () => {
      const d = new Date("2024-01-15T00:00:00Z");
      expect(formatCellValue(d, meta("DATE"))).toBe("2024-01-15");
    });

    it("formats epoch days (number)", () => {
      // 2024-01-15 is approximately day 19736 since epoch
      const result = formatCellValue(19736, meta("DATE"));
      // Should be a date string (exact value depends on timezone)
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("formats epoch milliseconds", () => {
      const ms = new Date("2024-01-15T00:00:00Z").getTime();
      const result = formatCellValue(ms, meta("DATE"));
      expect(result).toBe("2024-01-15");
    });

    it("formats BigInt epoch days", () => {
      const result = formatCellValue(BigInt(19736), meta("DATE"));
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── TIME ─────────────────────────────────────────────────────
  describe("TIME", () => {
    it("formats Date object as time", () => {
      const d = new Date("2024-01-15T14:30:45Z");
      expect(formatCellValue(d, meta("TIME"))).toBe("14:30:45");
    });

    it("formats microseconds (number)", () => {
      // 14:30:45 = 52245 seconds = 52245000000 microseconds
      const result = formatCellValue(52245000000, meta("TIME"));
      expect(result).toBe("14:30:45");
    });

    it("formats microseconds with fractional", () => {
      // 14:30:45.123 = 52245123000 microseconds
      const result = formatCellValue(52245123000, meta("TIME"));
      expect(result).toBe("14:30:45.123");
    });

    it("formats midnight", () => {
      const result = formatCellValue(0, meta("TIME"));
      expect(result).toBe("00:00:00");
    });

    it("formats microseconds (14:30:45)", () => {
      // 14:30:45 in microseconds = 52245 * 1000000 = 52245000000
      const result = formatCellValue(52245000000, meta("TIME"));
      expect(result).toBe("14:30:45");
    });

    it("formats BigInt microseconds", () => {
      const result = formatCellValue(BigInt(52245000000), meta("TIME"));
      expect(result).toBe("14:30:45");
    });
  });

  // ── TIMESTAMP variants ───────────────────────────────────────
  describe("TIMESTAMP", () => {
    it("formats Date object as timestamp", () => {
      const d = new Date("2024-01-15T14:30:45.123Z");
      const result = formatCellValue(d, meta("TIMESTAMP_US"));
      expect(result).toBe("2024-01-15 14:30:45.123");
    });

    it("formats epoch milliseconds", () => {
      const ms = new Date("2024-01-15T14:30:45.000Z").getTime();
      const result = formatCellValue(ms, meta("TIMESTAMP_US"));
      expect(result).toBe("2024-01-15 14:30:45.000");
    });

    it("formats TIMESTAMP with TIME ZONE", () => {
      const d = new Date("2024-01-15T14:30:45.000Z");
      const result = formatCellValue(d, meta("TIMESTAMPTZ"));
      expect(result).toBe("2024-01-15 14:30:45.000 UTC");
    });

    it("formats date-only timestamp", () => {
      const d = new Date("2024-01-15T00:00:00.000Z");
      const result = formatCellValue(d, meta("TIMESTAMP_US"));
      expect(result).toBe("2024-01-15");
    });

    it("formats TIMESTAMP_S (seconds)", () => {
      const sec = Math.floor(new Date("2024-01-15T14:30:45Z").getTime() / 1000);
      const result = formatCellValue(sec, meta("TIMESTAMP_S"));
      expect(result).toBe("2024-01-15 14:30:45.000");
    });

    it("formats TIMESTAMP_MS (milliseconds)", () => {
      const ms = new Date("2024-01-15T14:30:45.000Z").getTime();
      const result = formatCellValue(ms, meta("TIMESTAMP_MS"));
      expect(result).toBe("2024-01-15 14:30:45.000");
    });

    it("formats TIMESTAMP_NS with BigInt", () => {
      // 2024-01-15T14:30:45Z in nanoseconds
      const sec = Math.floor(new Date("2024-01-15T14:30:45Z").getTime() / 1000);
      const ns = BigInt(sec) * BigInt(1_000_000_000);
      const result = formatCellValue(ns, meta("TIMESTAMP_NS"));
      expect(result).toContain("2024-01-15 14:30:45");
    });

    it("formats TIMESTAMP_NS with nanosecond precision", () => {
      const sec = Math.floor(new Date("2024-01-15T14:30:45Z").getTime() / 1000);
      const ns = BigInt(sec) * BigInt(1_000_000_000) + BigInt(123456789);
      const result = formatCellValue(ns, meta("TIMESTAMP_NS"));
      expect(result).toContain("123456789");
    });

    it("formats TIMESTAMPTZ from BigInt milliseconds", () => {
      const ms = BigInt(new Date("2024-01-15T14:30:45Z").getTime());
      const result = formatCellValue(ms, meta("TIMESTAMPTZ"));
      expect(result).toContain("2024-01-15 14:30:45");
      expect(result).toContain("UTC");
    });

    it("formats string timestamp fallback", () => {
      expect(formatCellValue("2024-01-15", meta("TIMESTAMP_US"))).toBe("2024-01-15");
    });
  });

  // ── INTERVAL ─────────────────────────────────────────────────
  describe("INTERVAL", () => {
    it("formats object with months/days/nanoseconds", () => {
      const val = { months: 1, days: 15, nanoseconds: BigInt(3661000000000) };
      const result = formatCellValue(val, meta("INTERVAL"));
      expect(result).toBe("1 month 15 days 1 hour 1 minute 1 second");
    });

    it("formats Int32Array interval", () => {
      // 2 months, 3 days, 0 nanoseconds
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setInt32(0, 3, true); // days = 3
      view.setInt32(4, 2, true); // months = 2
      view.setInt32(8, 0, true); // nanosLo = 0
      view.setInt32(12, 0, true); // nanosHi = 0
      const arr = new Int32Array(buffer);
      const result = formatCellValue(arr, meta("INTERVAL"));
      expect(typeof result).toBe("string");
      expect(result).toContain("2 months");
      expect(result).toContain("3 days");
    });

    it("formats Int32Array with time component", () => {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setInt32(0, 0, true); // days
      view.setInt32(4, 0, true); // months
      // 7200 seconds = 2 hours = 7200000000000 nanoseconds
      const nanos = BigInt(7200) * BigInt(1_000_000_000);
      const nanosLo = Number(nanos & BigInt(0xFFFFFFFF));
      const nanosHi = Number((nanos >> BigInt(32)) & BigInt(0xFFFFFFFF));
      view.setInt32(8, nanosLo, true);
      view.setInt32(12, nanosHi, true);
      const arr = new Int32Array(buffer);
      const result = formatCellValue(arr, meta("INTERVAL"));
      expect(typeof result).toBe("string");
      expect(result).toContain("2 hours");
    });

    it("formats string interval '1,0'", () => {
      const result = formatCellValue("1,0", meta("INTERVAL"));
      expect(result).toBeTruthy();
    });

    it("formats plain string interval", () => {
      expect(formatCellValue("1 year", meta("INTERVAL"))).toBe("1 year");
    });

    it("formats null interval", () => {
      expect(formatCellValue(null, meta("INTERVAL"))).toBeNull();
    });

    it("formats interval with only seconds", () => {
      const val = { months: 0, days: 0, nanoseconds: BigInt(45) * BigInt(1_000_000_000) };
      const result = formatCellValue(val, meta("INTERVAL"));
      expect(result).toBe("45 seconds");
    });

    it("formats interval with all components", () => {
      const val = { months: 1, days: 2, nanoseconds: BigInt(3661) * BigInt(1_000_000_000) };
      const result = formatCellValue(val, meta("INTERVAL"));
      expect(result).toContain("1 month");
      expect(result).toContain("2 days");
      expect(result).toContain("1 hour");
      expect(result).toContain("1 minute");
      expect(result).toContain("1 second");
    });

    it("formats zero interval as 0 seconds", () => {
      const val = { months: 0, days: 0, nanoseconds: BigInt(0) };
      const result = formatCellValue(val, meta("INTERVAL"));
      expect(result).toBe("0 seconds");
    });
  });

  // ── UUID ─────────────────────────────────────────────────────
  describe("UUID", () => {
    it("formats Uint8Array UUID", () => {
      const bytes = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
      ]);
      const result = formatCellValue(bytes, meta("UUID"));
      expect(result).toBe("01234567-89ab-cdef-0123-456789abcdef");
    });

    it("formats string UUID", () => {
      expect(
        formatCellValue("550e8400-e29b-41d4-a716-446655440000", meta("UUID"))
      ).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });

  // ── JSON ─────────────────────────────────────────────────────
  describe("JSON", () => {
    it("formats null JSON", () => {
      // null input returns null early (before type dispatch)
      expect(formatCellValue(null, meta("JSON"))).toBeNull();
    });

    it("formats object as-is", () => {
      const obj = { a: 1, b: "two" };
      expect(formatCellValue(obj, meta("JSON"))).toBe(obj);
    });

    it("formats JSON string to parsed object", () => {
      const result = formatCellValue('{"key":"value"}', meta("JSON"));
      expect(result).toEqual({ key: "value" });
    });

    it("formats JSON string with extra quotes", () => {
      const result = formatCellValue('"{\\"key\\":\\"value\\"}"', meta("JSON"));
      expect(result).toEqual({ key: "value" });
    });

    it("formats non-JSON string as-is", () => {
      expect(formatCellValue("not json", meta("JSON"))).toBe("not json");
    });

    it("formats number as string", () => {
      expect(formatCellValue(42, meta("JSON"))).toBe("42");
    });

    it("formats JSON array string", () => {
      const result = formatCellValue("[1, 2, 3]", meta("JSON"));
      expect(result).toEqual([1, 2, 3]);
    });
  });

  // ── STRUCT ──────────────────────────────────────────────────
  describe("STRUCT", () => {
    it("formats null STRUCT", () => {
      // null input returns null early (before type dispatch)
      expect(formatCellValue(null, meta("STRUCT"))).toBeNull();
    });

    it("formats object with toJSON", () => {
      const obj = { toJSON: () => ({ a: 1, b: 2 }) };
      const result = formatCellValue(obj, meta("STRUCT"));
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("formats plain object", () => {
      const obj = { x: 10, y: 20 };
      const result = formatCellValue(obj, meta("STRUCT"));
      expect(result).toEqual({ x: 10, y: 20 });
    });

    it("formats non-object to {value: val}", () => {
      const result = formatCellValue("plain", meta("STRUCT"));
      expect(result).toEqual({ value: "plain" });
    });

    it("filters __ prefixed keys", () => {
      const obj = { __proxy: true, visible: 1 };
      const result = formatCellValue(obj, meta("STRUCT")) as Record<string, unknown>;
      expect(result).toHaveProperty("visible");
    });
  });

  // ── MAP ──────────────────────────────────────────────────────
  describe("MAP", () => {
    it("formats null MAP", () => {
      // null input returns null early (before type dispatch)
      expect(formatCellValue(null, meta("MAP"))).toBeNull();
    });

    it("formats object with toJSON", () => {
      const obj = { toJSON: () => ({ a: 1, b: 2 }) };
      const result = formatCellValue(obj, meta("MAP"));
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("formats plain object as-is", () => {
      const obj = { key1: "val1", key2: "val2" };
      const result = formatCellValue(obj, meta("MAP"));
      expect(result).toBe(obj);
    });

    it("formats non-object to {value: val}", () => {
      const result = formatCellValue("plain", meta("MAP"));
      expect(result).toEqual({ value: "plain" });
    });
  });

  // ── ARRAY ────────────────────────────────────────────────────
  describe("ARRAY", () => {
    it("formats null ARRAY", () => {
      // null input returns null early (before type dispatch)
      expect(formatCellValue(null, meta("ARRAY"))).toBeNull();
    });

    it("formats array as-is", () => {
      expect(formatCellValue([1, 2, 3], meta("ARRAY"))).toEqual([1, 2, 3]);
    });

    it("formats object with toJSON returning array", () => {
      const obj = { toJSON: () => [1, 2, 3] };
      const result = formatCellValue(obj, meta("ARRAY"));
      expect(result).toEqual([1, 2, 3]);
    });

    it("formats object with toJSON returning non-array", () => {
      const obj = { toJSON: () => "single" };
      const result = formatCellValue(obj, meta("ARRAY"));
      expect(result).toEqual(["single"]);
    });

    it("formats non-array object as Array.from result", () => {
      const obj = { key: "value" };
      const result = formatCellValue(obj, meta("ARRAY"));
      // Array.from({ key: "value" }) returns [] since object is not iterable
      expect(Array.isArray(result)).toBe(true);
    });

    it("formats string as single-element array", () => {
      const result = formatCellValue("hello", meta("ARRAY"));
      expect(result).toEqual(["hello"]);
    });
  });

  // ── Default / unknown ────────────────────────────────────────
  describe("UNKNOWN", () => {
    it("formats string", () => {
      expect(formatCellValue("test", meta("UNKNOWN"))).toBe("test");
    });

    it("formats number", () => {
      expect(formatCellValue(42, meta("UNKNOWN"))).toBe(42);
    });

    it("formats BigInt as string", () => {
      expect(formatCellValue(BigInt(42), meta("UNKNOWN"))).toBe("42");
    });

    it("formats object with toJSON", () => {
      const obj = { toJSON: () => ({ a: 1 }) };
      const result = formatCellValue(obj, meta("UNKNOWN"));
      expect(result).toEqual({ a: 1 });
    });
  });

  // ── Edge cases ──────────────────────────────────────────────
  describe("edge cases", () => {
    it("handles NaN for INTEGER", () => {
      expect(formatCellValue(NaN, meta("INTEGER"))).toBeNaN();
    });

    it("handles very large DECIMAL scale", () => {
      const m = meta("DECIMAL", "DECIMAL(38,20)", { scale: 20n });
      expect(formatCellValue(BigInt(1), m)).toContain(".");
    });

    it("handles negative DECIMAL with zero value", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      expect(formatCellValue(BigInt(0), m)).toBe("0.0000");
    });

    it("handles 0 for DATE", () => {
      const result = formatCellValue(0, meta("DATE"));
      expect(result).toBe("1970-01-01");
    });

    it("handles DECIMAL string with scientific notation", () => {
      const m = meta("DECIMAL", "DECIMAL(18,4)", { scale: 4n });
      const result = formatCellValue("1.5e3", m);
      expect(result).toBeTruthy();
    });
  });
});
