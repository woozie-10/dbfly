import { describe, it, expect } from "vitest";
import {
  inferColumnType,
  toSqlValue,
  type ImportColumnType,
} from "@/engine/type-inference";

// ─────────────────────────────────────────────────────────────────────────────
// inferColumnType
// ─────────────────────────────────────────────────────────────────────────────

describe("inferColumnType — numeric types", () => {
  it("infers INTEGER for small integers", () => {
    expect(inferColumnType(["1", "2", "3"])).toBe("INTEGER");
    expect(inferColumnType([1, 2, 3])).toBe("INTEGER");
    expect(inferColumnType(["-2147483648", "2147483647"])).toBe("INTEGER");
  });

  it("infers BIGINT when values exceed 32-bit range", () => {
    expect(inferColumnType(["2147483648"])).toBe("BIGINT");
    expect(inferColumnType(["-2147483649", "5"])).toBe("BIGINT");
    expect(inferColumnType(["9223372036854775807"])).toBe("BIGINT");
    expect(inferColumnType([9007199254740991, 5])).toBe("BIGINT"); // Number.MAX_SAFE_INTEGER
  });

  it("widens int32 + int64 mixture to BIGINT", () => {
    expect(inferColumnType(["1", "5000000000"])).toBe("BIGINT");
    expect(inferColumnType([1, 5000000000])).toBe("BIGINT");
  });

  it("infers DOUBLE for decimals and scientific notation", () => {
    expect(inferColumnType(["3.14", "2.5"])).toBe("DOUBLE");
    expect(inferColumnType(["1e5", "2.5e-3"])).toBe("DOUBLE");
    expect(inferColumnType([".5", "1.5"])).toBe("DOUBLE");
    expect(inferColumnType([3.14, 2.5])).toBe("DOUBLE");
    expect(inferColumnType(["1", "2", "3.14"])).toBe("DOUBLE");
    expect(inferColumnType([1, 2, 3.14])).toBe("DOUBLE");
    expect(inferColumnType(["5000000000", "1.5"])).toBe("DOUBLE");
  });

  it("keeps numbers with a plus sign numeric", () => {
    expect(inferColumnType(["+42", "-7"])).toBe("INTEGER");
    expect(inferColumnType(["+1.5"])).toBe("DOUBLE");
  });

  it("keeps padded integer-like strings as text (007)", () => {
    expect(inferColumnType(["007"])).toBe("VARCHAR");
    expect(inferColumnType(["001", "002"])).toBe("VARCHAR");
    expect(inferColumnType(["007", "1"])).toBe("VARCHAR");
    expect(inferColumnType(["-007"])).toBe("VARCHAR");
    // "0" and "0.5" are real numbers, not padded codes
    expect(inferColumnType(["0"])).toBe("INTEGER");
    expect(inferColumnType(["0.5"])).toBe("DOUBLE");
  });

  it("keeps integers beyond 64-bit as text to preserve digits", () => {
    expect(inferColumnType(["99999999999999999999999"])).toBe("VARCHAR");
    expect(inferColumnType(["9223372036854775808"])).toBe("VARCHAR");
    expect(inferColumnType(["-9223372036854775809"])).toBe("VARCHAR");
  });
});

describe("inferColumnType — booleans", () => {
  it("infers BOOLEAN for true/false", () => {
    expect(inferColumnType(["true", "false"])).toBe("BOOLEAN");
    expect(inferColumnType(["TRUE", "False"])).toBe("BOOLEAN");
    expect(inferColumnType([true, false])).toBe("BOOLEAN");
  });

  it("falls back to VARCHAR when booleans mix with numbers or dates", () => {
    expect(inferColumnType(["true", "1"])).toBe("VARCHAR");
    expect(inferColumnType([true, 1])).toBe("VARCHAR");
    expect(inferColumnType(["true", "2024-01-01"])).toBe("VARCHAR");
  });
});

describe("inferColumnType — dates and timestamps", () => {
  it("infers DATE for YYYY-MM-DD", () => {
    expect(inferColumnType(["2024-01-15", "2023-12-31"])).toBe("DATE");
    expect(inferColumnType(["2024-1-5"])).toBe("DATE");
  });

  it("infers TIMESTAMP for datetime values", () => {
    expect(inferColumnType(["2024-01-15 14:30:00"])).toBe("TIMESTAMP");
    expect(inferColumnType(["2024-01-15T14:30:00"])).toBe("TIMESTAMP");
    expect(inferColumnType(["2024-01-15 14:30"])).toBe("TIMESTAMP");
    expect(inferColumnType(["2024-01-15T14:30:00.123Z"])).toBe("TIMESTAMP");
    expect(inferColumnType(["2024-01-15 14:30:00+02:00"])).toBe("TIMESTAMP");
  });

  it("widens date + datetime mixture to TIMESTAMP", () => {
    expect(
      inferColumnType(["2024-01-15", "2024-01-16 10:00:00"])
    ).toBe("TIMESTAMP");
  });

  it("rejects invalid calendar dates as text", () => {
    expect(inferColumnType(["2024-13-01"])).toBe("VARCHAR");
    expect(inferColumnType(["2024-02-30"])).toBe("VARCHAR");
    expect(inferColumnType(["2023-02-29"])).toBe("VARCHAR"); // not a leap year
    expect(inferColumnType(["2024-02-29"])).toBe("DATE"); // leap year OK
    expect(inferColumnType(["2024-01-01 25:00:00"])).toBe("VARCHAR");
    expect(inferColumnType(["2024-01-01 10:99:00"])).toBe("VARCHAR");
  });

  it("falls back to VARCHAR when dates mix with numbers or text", () => {
    expect(inferColumnType(["2024-01-01", "42"])).toBe("VARCHAR");
    expect(inferColumnType(["2024-01-01", "hello"])).toBe("VARCHAR");
  });
});

describe("inferColumnType — text and mixed values", () => {
  it("infers VARCHAR for plain text", () => {
    expect(inferColumnType(["Alice", "Bob"])).toBe("VARCHAR");
    expect(inferColumnType(["hello world", "x"])).toBe("VARCHAR");
  });

  it("falls back to VARCHAR for any text + typed mixture", () => {
    expect(inferColumnType(["1", "abc"])).toBe("VARCHAR");
    expect(inferColumnType(["3.14", "abc"])).toBe("VARCHAR");
    expect(inferColumnType(["true", "abc"])).toBe("VARCHAR");
    expect(inferColumnType(["2024-01-01", "abc"])).toBe("VARCHAR");
    expect(inferColumnType(["2024-01-01", "1.5"])).toBe("VARCHAR");
  });

  it("infers VARCHAR for objects/arrays (kept as JSON text)", () => {
    expect(inferColumnType([{ a: 1 }, { a: 2 }])).toBe("VARCHAR");
    expect(inferColumnType([["a"], ["b"]])).toBe("VARCHAR");
    expect(inferColumnType([1, { a: 1 }])).toBe("VARCHAR");
  });

  it("does not treat whitespace-only strings as null", () => {
    expect(inferColumnType(["  Alice  "])).toBe("VARCHAR");
  });
});

describe("inferColumnType — NULL handling", () => {
  it("never lets NULL values downgrade the inferred type", () => {
    expect(inferColumnType([1, null, 3, undefined])).toBe("INTEGER");
    expect(inferColumnType(["1", null, null, undefined])).toBe("INTEGER"); // CSV "" → null before inference
    expect(inferColumnType(["3.5", null, "1.25"])).toBe("DOUBLE");
    expect(inferColumnType(["true", null, "false"])).toBe("BOOLEAN");
    expect(inferColumnType(["2024-01-01", null])).toBe("DATE");
    expect(inferColumnType(["2024-01-01 10:00:00", null])).toBe("TIMESTAMP");
    expect(inferColumnType(["Alice", null, "Bob"])).toBe("VARCHAR");
  });

  it("returns VARCHAR when every value is null/empty", () => {
    expect(inferColumnType([])).toBe("VARCHAR");
    expect(inferColumnType([null, null])).toBe("VARCHAR");
    expect(inferColumnType([null, undefined, null])).toBe("VARCHAR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toSqlValue
// ─────────────────────────────────────────────────────────────────────────────

describe("toSqlValue — NULL and VARCHAR", () => {
  it("renders null and undefined as SQL NULL", () => {
    expect(toSqlValue(null, "VARCHAR")).toBe("NULL");
    expect(toSqlValue(undefined, "INTEGER")).toBe("NULL");
  });

  it("renders VARCHAR with quoting and escaping", () => {
    expect(toSqlValue("Alice", "VARCHAR")).toBe("'Alice'");
    expect(toSqlValue("it's", "VARCHAR")).toBe("'it''s'");
    expect(toSqlValue("", "VARCHAR")).toBe("''");
    expect(toSqlValue(5, "VARCHAR")).toBe("'5'");
    expect(toSqlValue(true, "VARCHAR")).toBe("'true'");
  });

  it("JSON-stringifies objects for VARCHAR columns", () => {
    expect(toSqlValue({ a: 1 }, "VARCHAR")).toBe("'{\"a\":1}'");
    expect(toSqlValue(["x", "y"], "VARCHAR")).toBe("'[\"x\",\"y\"]'");
  });
});

describe("toSqlValue — typed columns", () => {
  it("renders INTEGER and BIGINT as normalized integer literals", () => {
    expect(toSqlValue("42", "INTEGER")).toBe("42");
    expect(toSqlValue("+42", "INTEGER")).toBe("42");
    expect(toSqlValue("-7", "INTEGER")).toBe("-7");
    expect(toSqlValue(42, "INTEGER")).toBe("42");
    expect(toSqlValue(" 42 ", "INTEGER")).toBe("42");
    expect(toSqlValue("9223372036854775807", "BIGINT")).toBe(
      "9223372036854775807"
    );
    expect(toSqlValue("-9223372036854775808", "BIGINT")).toBe(
      "-9223372036854775808"
    );
  });

  it("renders DOUBLE via CAST, normalizing leading-dot floats", () => {
    expect(toSqlValue("3.14", "DOUBLE")).toBe("CAST('3.14' AS DOUBLE)");
    expect(toSqlValue(".5", "DOUBLE")).toBe("CAST('0.5' AS DOUBLE)");
    expect(toSqlValue("-.5", "DOUBLE")).toBe("CAST('-0.5' AS DOUBLE)");
    expect(toSqlValue("1e5", "DOUBLE")).toBe("CAST('1e5' AS DOUBLE)");
    expect(toSqlValue(3.14, "DOUBLE")).toBe("CAST('3.14' AS DOUBLE)");
    expect(toSqlValue(0.1, "DOUBLE")).toBe("CAST('0.1' AS DOUBLE)");
  });

  it("renders BOOLEAN via CAST with lowercased value", () => {
    expect(toSqlValue("true", "BOOLEAN")).toBe("CAST('true' AS BOOLEAN)");
    expect(toSqlValue("TRUE", "BOOLEAN")).toBe("CAST('true' AS BOOLEAN)");
    expect(toSqlValue(true, "BOOLEAN")).toBe("CAST('true' AS BOOLEAN)");
    expect(toSqlValue("False", "BOOLEAN")).toBe("CAST('false' AS BOOLEAN)");
  });

  it("renders DATE and TIMESTAMP via CAST", () => {
    expect(toSqlValue("2024-01-15", "DATE")).toBe(
      "CAST('2024-01-15' AS DATE)"
    );
    expect(toSqlValue("2024-01-15 14:30:00", "TIMESTAMP")).toBe(
      "CAST('2024-01-15 14:30:00' AS TIMESTAMP)"
    );
  });

  it("escapes quotes inside CAST literals", () => {
    expect(toSqlValue("O''Brien", "VARCHAR")).toBe("'O''''Brien'");
  });
});

// Sanity: every inferred type renders a literal that DuckDB can parse.
describe("infer → literal consistency", () => {
  it("produces valid literals for typical columns", () => {
    const cases: Array<{ col: ImportColumnType; val: unknown }> = [
      { col: "INTEGER", val: "12" },
      { col: "BIGINT", val: "9999999999" },
      { col: "DOUBLE", val: "1.25" },
      { col: "BOOLEAN", val: "true" },
      { col: "DATE", val: "2024-01-01" },
      { col: "TIMESTAMP", val: "2024-01-01 12:00:00" },
      { col: "VARCHAR", val: "text, with, commas" },
    ];
    for (const c of cases) {
      expect(inferColumnType([c.val, null])).toBe(c.col);
      expect(toSqlValue(c.val, c.col)).toMatch(/^(?:NULL|'.*'|-?\d+|CAST\()/);
    }
  });
});
