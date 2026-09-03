import { describe, it, expect } from "vitest";
import { extractColumnMeta } from "@/engine/column-meta";

// Helper to create a mock Arrow type
function mockArrowType(typeId: number, overrides: Record<string, unknown> = {}) {
  return { typeId, ...overrides };
}

// Arrow TypeId constants (matching the internal TYPE map)
const TYPE = {
  NONE: 0,
  Null: 1,
  Int: 2,
  Float: 3,
  Binary: 4,
  Utf8: 5,
  Bool: 6,
  Decimal: 7,
  Date: 8,
  Time: 9,
  Timestamp: 10,
  Interval: 11,
  List: 12,
  Struct: 13,
  Union: 14,
  FixedSizeBinary: 15,
  FixedSizeList: 16,
  Map: 17,
};

describe("extractColumnMeta", () => {
  // ── Boolean ──────────────────────────────────────────────────
  describe("BOOLEAN", () => {
    it("resolves Bool type", () => {
      const result = extractColumnMeta("is_active", mockArrowType(TYPE.Bool));
      expect(result.name).toBe("is_active");
      expect(result.baseType).toBe("BOOLEAN");
      expect(result.sqlType).toBe("BOOLEAN");
    });
  });

  // ── Integer types ────────────────────────────────────────────
  describe("Integers", () => {
    it("resolves signed TINYINT (8-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 8, isSigned: true }));
      expect(result.baseType).toBe("TINYINT");
      expect(result.sqlType).toBe("TINYINT");
    });

    it("resolves signed SMALLINT (16-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 16, isSigned: true }));
      expect(result.baseType).toBe("SMALLINT");
    });

    it("resolves signed INTEGER (32-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 32, isSigned: true }));
      expect(result.baseType).toBe("INTEGER");
    });

    it("resolves signed BIGINT (64-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 64, isSigned: true }));
      expect(result.baseType).toBe("BIGINT");
    });

    it("resolves unsigned TINYINT (8-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 8, isSigned: false }));
      expect(result.baseType).toBe("UTINYINT");
    });

    it("resolves unsigned SMALLINT (16-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 16, isSigned: false }));
      expect(result.baseType).toBe("USMALLINT");
    });

    it("resolves unsigned INTEGER (32-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 32, isSigned: false }));
      expect(result.baseType).toBe("UINTEGER");
    });

    it("resolves unsigned BIGINT (64-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 64, isSigned: false }));
      expect(result.baseType).toBe("UBIGINT");
    });

    it("handles unknown bit width gracefully", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Int, { bitWidth: 128, isSigned: true }));
      expect(result.baseType).toBe("INTEGER");
      expect(result.sqlType).toContain("128");
    });
  });

  // ── Float types ──────────────────────────────────────────────
  describe("Floats", () => {
    it("resolves FLOAT (32-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Float, { bitWidth: 32 }));
      expect(result.baseType).toBe("FLOAT");
      expect(result.sqlType).toBe("FLOAT");
    });

    it("resolves DOUBLE (64-bit)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Float, { bitWidth: 64 }));
      expect(result.baseType).toBe("DOUBLE");
      expect(result.sqlType).toBe("DOUBLE");
    });
  });

  // ── Decimal ──────────────────────────────────────────────────
  describe("DECIMAL", () => {
    it("resolves DECIMAL with scale and precision", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Decimal, { scale: 4n, precision: 18 }));
      expect(result.baseType).toBe("DECIMAL");
      expect(result.sqlType).toBe("DECIMAL(18,4)");
    });

    it("resolves DECIMAL with zero scale", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Decimal, { scale: 0n, precision: 38 }));
      expect(result.sqlType).toBe("DECIMAL(38,0)");
    });
  });

  // ── Date ─────────────────────────────────────────────────────
  describe("DATE", () => {
    it("resolves DATE", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Date));
      expect(result.baseType).toBe("DATE");
      expect(result.sqlType).toBe("DATE");
    });
  });

  // ── Time ─────────────────────────────────────────────────────
  describe("TIME", () => {
    it("resolves TIME without timezone", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Time, { timezone: null }));
      expect(result.baseType).toBe("TIME");
      expect(result.sqlType).toBe("TIME");
    });

    it("resolves TIME WITH TIME ZONE", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Time, { timezone: "UTC" }));
      expect(result.baseType).toBe("TIME");
      expect(result.sqlType).toBe("TIME WITH TIME ZONE");
    });
  });

  // ── Timestamp ────────────────────────────────────────────────
  describe("TIMESTAMP", () => {
    it("resolves TIMESTAMP_US (microsecond, default)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "microsecond", timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_US");
      expect(result.sqlType).toBe("TIMESTAMP");
    });

    it("resolves TIMESTAMP_S (second)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "second", timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_S");
    });

    it("resolves TIMESTAMP_MS (millisecond)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "millisecond", timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_MS");
    });

    it("resolves TIMESTAMP_NS (nanosecond)", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "nanosecond", timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_NS");
    });

    it("resolves TIMESTAMPTZ with timezone", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "microsecond", timezone: "UTC" }));
      expect(result.baseType).toBe("TIMESTAMPTZ");
      expect(result.sqlType).toBe("TIMESTAMP WITH TIME ZONE");
    });

    it("resolves timestamp with numeric unit", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: 2, timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_US");
    });

    it("resolves timestamp with uppercase unit string", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Timestamp, { unit: "NANOSECOND", timezone: null }));
      expect(result.baseType).toBe("TIMESTAMP_NS");
    });
  });

  // ── Interval ─────────────────────────────────────────────────
  describe("INTERVAL", () => {
    it("resolves INTERVAL", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Interval));
      expect(result.baseType).toBe("INTERVAL");
      expect(result.sqlType).toBe("INTERVAL");
    });
  });

  // ── Binary / BLOB ───────────────────────────────────────────
  describe("Binary", () => {
    it("resolves BLOB from Binary type", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Binary));
      expect(result.baseType).toBe("BLOB");
    });
  });

  // ── FixedSizeBinary ──────────────────────────────────────────
  describe("FixedSizeBinary", () => {
    it("resolves UUID from 16-byte FixedSizeBinary", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.FixedSizeBinary, { byteWidth: 16 }));
      expect(result.baseType).toBe("UUID");
      expect(result.sqlType).toBe("UUID");
    });

    it("resolves BLOB from other FixedSizeBinary", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.FixedSizeBinary, { byteWidth: 8 }));
      expect(result.baseType).toBe("BLOB");
    });
  });

  // ── Utf8 (VARCHAR) ──────────────────────────────────────────
  describe("Utf8 / VARCHAR", () => {
    it("resolves VARCHAR", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Utf8));
      expect(result.baseType).toBe("VARCHAR");
      expect(result.sqlType).toBe("VARCHAR");
    });

    it("resolves JSON from Utf8 with DUCKDB:INTERNAL_TYPE metadata", () => {
      const arrowType = mockArrowType(TYPE.Utf8, {
        metadata: { "DUCKDB:INTERNAL_TYPE": "json" },
      });
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("JSON");
      expect(result.sqlType).toBe("JSON");
    });

    it("resolves VARCHAR when metadata has non-json type", () => {
      const arrowType = mockArrowType(TYPE.Utf8, {
        metadata: { "DUCKDB:INTERNAL_TYPE": "varchar" },
      });
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("VARCHAR");
    });
  });

  // ── List (ARRAY) ────────────────────────────────────────────
  describe("List / ARRAY", () => {
    it("resolves ARRAY of integers", () => {
      const valueType = mockArrowType(TYPE.Int, { bitWidth: 32, isSigned: true });
      const result = extractColumnMeta("col", mockArrowType(TYPE.List, { valueType }));
      expect(result.baseType).toBe("ARRAY");
      expect(result.sqlType).toBe("INTEGER[]");
    });

    it("resolves ARRAY of VARCHAR", () => {
      const valueType = mockArrowType(TYPE.Utf8);
      const result = extractColumnMeta("col", mockArrowType(TYPE.List, { valueType }));
      expect(result.baseType).toBe("ARRAY");
      expect(result.sqlType).toBe("VARCHAR[]");
    });
  });

  // ── Struct ──────────────────────────────────────────────────
  describe("Struct", () => {
    it("resolves STRUCT with fields", () => {
      const fields = [
        { name: "x", type: mockArrowType(TYPE.Int, { bitWidth: 32, isSigned: true }) },
        { name: "y", type: mockArrowType(TYPE.Utf8) },
      ];
      const result = extractColumnMeta("col", mockArrowType(TYPE.Struct, { fields }));
      expect(result.baseType).toBe("STRUCT");
      expect(result.sqlType).toContain("STRUCT");
      expect(result.sqlType).toContain("x INTEGER");
      expect(result.sqlType).toContain("y VARCHAR");
    });

    it("resolves empty STRUCT", () => {
      const result = extractColumnMeta("col", mockArrowType(TYPE.Struct, { fields: [] }));
      expect(result.baseType).toBe("STRUCT");
      expect(result.sqlType).toBe("STRUCT()");
    });
  });

  // ── Map ──────────────────────────────────────────────────────
  describe("Map", () => {
    it("resolves MAP with key/value types", () => {
      const keyType = mockArrowType(TYPE.Utf8);
      const valType = mockArrowType(TYPE.Int, { bitWidth: 32, isSigned: true });
      const result = extractColumnMeta("col", mockArrowType(TYPE.Map, { keyType, valueType: valType }));
      expect(result.baseType).toBe("MAP");
      expect(result.sqlType).toBe("MAP(VARCHAR, INTEGER)");
    });
  });

  // ── Fallback via toString() ──────────────────────────────────
  describe("Fallback type resolution", () => {
    it("resolves INTERVAL from toString()", () => {
      const arrowType = {
        typeId: 999,
        toString: () => "Duration[ns]",
      };
      // Fallback checks: interval, json, uuid, blob
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("UNKNOWN");
    });

    it("resolves UUID from toString() fallback", () => {
      const arrowType = {
        typeId: 999,
        toString: () => "UUID",
      };
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("UUID");
    });

    it("resolves JSON from toString() fallback", () => {
      const arrowType = {
        typeId: 999,
        toString: () => "JSON",
      };
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("JSON");
    });

    it("resolves BLOB from toString() fallback", () => {
      const arrowType = {
        typeId: 999,
        toString: () => "BLOB",
      };
      const result = extractColumnMeta("col", arrowType);
      expect(result.baseType).toBe("BLOB");
    });
  });

  // ── Name assignment ──────────────────────────────────────────
  describe("name assignment", () => {
    it("assigns the field name correctly", () => {
      const result = extractColumnMeta("my_column", mockArrowType(TYPE.Bool));
      expect(result.name).toBe("my_column");
    });

    it("assigns empty string for no name", () => {
      const result = extractColumnMeta("", mockArrowType(TYPE.Bool));
      expect(result.name).toBe("");
    });
  });

  // ── arrowType preservation ──────────────────────────────────
  describe("arrowType preservation", () => {
    it("preserves the arrowType reference", () => {
      const at = mockArrowType(TYPE.Decimal, { scale: 4n, precision: 18 });
      const result = extractColumnMeta("col", at);
      expect(result.arrowType).toBe(at);
    });
  });
});
