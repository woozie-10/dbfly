/**
 * Maps Apache Arrow field types to DuckDB SQL type strings.
 *
 * Uses Arrow's type system (typeId + properties) to determine the exact
 * DuckDB SQL type for each column. This is the single source of truth for
 * type classification — no fallback heuristics, no string parsing of typeStr.
 */

/** DuckDB base type discriminator used for formatting dispatch */
export type DuckDBBaseType =
  | "BOOLEAN"
  | "TINYINT" | "SMALLINT" | "INTEGER" | "BIGINT" | "HUGEINT"
  | "UTINYINT" | "USMALLINT" | "UINTEGER" | "UBIGINT" | "UHUGEINT"
  | "FLOAT" | "DOUBLE"
  | "DECIMAL"
  | "VARCHAR"
  | "CHAR"
  | "BLOB"
  | "DATE"
  | "TIME"
  | "TIMESTAMPTZ"
  | "TIMESTAMP_S"
  | "TIMESTAMP_MS"
  | "TIMESTAMP_US"
  | "TIMESTAMP_NS"
  | "INTERVAL"
  | "UUID"
  | "JSON"
  | "STRUCT"
  | "MAP"
  | "ARRAY"
  | "UNKNOWN";

/** Full metadata for a result column */
export interface ColumnMeta {
  /** Column name */
  name: string;
  /** DuckDB base type for formatting dispatch */
  baseType: DuckDBBaseType;
  /** Full DuckDB SQL type string for display (e.g. "DECIMAL(18,4)") */
  sqlType: string;
  /** Arrow DataType instance (for accessing scale, precision, unit, timezone, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arrowType: any;
}

/**
 * Arrow TypeId constants (from apache-arrow v17).
 * DuckDB-Wasm uses these to represent column types in the Arrow schema.
 */
const TYPE = {
  NONE: 0, Null: 1, Int: 2, Float: 3, Binary: 4, Utf8: 5,
  Bool: 6, Decimal: 7, Date: 8, Time: 9, Timestamp: 10,
  Interval: 11, List: 12, Struct: 13, Union: 14,
  FixedSizeBinary: 15, FixedSizeList: 16, Map: 17,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveType(fieldType: any): ColumnMeta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const at = fieldType as any;
  const typeId: number = at?.typeId ?? -1;
  const typeStr: string = (at?.toString?.() ?? "").toLowerCase();

  switch (typeId) {
    // ── Boolean ────────────────────────────────────────────────────────────
    case TYPE.Bool:
      return { name: "", baseType: "BOOLEAN", sqlType: "BOOLEAN", arrowType: at };

    // ── Integers ───────────────────────────────────────────────────────────
    case TYPE.Int: {
      const bits: number = at.bitWidth;
      const signed: boolean = at.isSigned;
      if (signed) {
        switch (bits) {
          case 8:  return { name: "", baseType: "TINYINT",   sqlType: "TINYINT",   arrowType: at };
          case 16: return { name: "", baseType: "SMALLINT",  sqlType: "SMALLINT",  arrowType: at };
          case 32: return { name: "", baseType: "INTEGER",   sqlType: "INTEGER",   arrowType: at };
          case 64: return { name: "", baseType: "BIGINT",    sqlType: "BIGINT",    arrowType: at };
        }
      } else {
        switch (bits) {
          case 8:  return { name: "", baseType: "UTINYINT",  sqlType: "UTINYINT",  arrowType: at };
          case 16: return { name: "", baseType: "USMALLINT", sqlType: "USMALLINT", arrowType: at };
          case 32: return { name: "", baseType: "UINTEGER",  sqlType: "UINTEGER",  arrowType: at };
          case 64: return { name: "", baseType: "UBIGINT",   sqlType: "UBIGINT",   arrowType: at };
        }
      }
      return { name: "", baseType: "INTEGER", sqlType: `INT${bits}`, arrowType: at };
    }

    // ── Floats ─────────────────────────────────────────────────────────────
    case TYPE.Float: {
      const bw: number = at.bitWidth;
      return bw === 32
        ? { name: "", baseType: "FLOAT", sqlType: "FLOAT", arrowType: at }
        : { name: "", baseType: "DOUBLE", sqlType: "DOUBLE", arrowType: at };
    }

    // ── Decimal ────────────────────────────────────────────────────────────
    case TYPE.Decimal: {
      const scale: number = Number(at.scale);
      const precision: number = Number(at.precision);
      // DuckDB HUGEINT is INT128, often stored as Decimal(precision=38, scale=0)
      // But DECIMAL(38,0) is also valid. We keep it as DECIMAL for safety.
      const sqlType = `DECIMAL(${precision},${scale})`;
      return { name: "", baseType: "DECIMAL", sqlType, arrowType: at };
    }

    // ── Date ───────────────────────────────────────────────────────────────
    case TYPE.Date:
      return { name: "", baseType: "DATE", sqlType: "DATE", arrowType: at };

    // ── Time ───────────────────────────────────────────────────────────────
    case TYPE.Time: {
      const tz = at.timezone;
      return tz
        ? { name: "", baseType: "TIME", sqlType: "TIME WITH TIME ZONE", arrowType: at }
        : { name: "", baseType: "TIME", sqlType: "TIME", arrowType: at };
    }

    // ── Timestamp ──────────────────────────────────────────────────────────
    case TYPE.Timestamp: {
      // at.unit can be a string ("nanosecond"), numeric enum (3), or uppercase ("NANOSECOND")
      const NUMERIC_UNIT_MAP: Record<number, string> = { 0: "second", 1: "millisecond", 2: "microsecond", 3: "nanosecond" };
      const rawUnit = at.unit;
      let unit: string;
      if (typeof rawUnit === "number") {
        unit = NUMERIC_UNIT_MAP[rawUnit] ?? String(rawUnit);
      } else if (typeof rawUnit === "string") {
        unit = rawUnit.toLowerCase();
      } else {
        unit = String(rawUnit ?? "").toLowerCase();
      }
      const tz: string | null = at.timezone ?? null;
      if (tz) {
        return { name: "", baseType: "TIMESTAMPTZ", sqlType: "TIMESTAMP WITH TIME ZONE", arrowType: at };
      }
      switch (unit) {
        case "second":      return { name: "", baseType: "TIMESTAMP_S", sqlType: "TIMESTAMP_S", arrowType: at };
        case "millisecond": return { name: "", baseType: "TIMESTAMP_MS", sqlType: "TIMESTAMP_MS", arrowType: at };
        case "microsecond": return { name: "", baseType: "TIMESTAMP_US", sqlType: "TIMESTAMP", arrowType: at };
        case "nanosecond":  return { name: "", baseType: "TIMESTAMP_NS", sqlType: "TIMESTAMP_NS", arrowType: at };
      }
      return { name: "", baseType: "TIMESTAMP_US", sqlType: "TIMESTAMP", arrowType: at };
    }

    // ── Interval ───────────────────────────────────────────────────────────
    case TYPE.Interval:
      return { name: "", baseType: "INTERVAL", sqlType: "INTERVAL", arrowType: at };

    // ── Binary / BLOB ──────────────────────────────────────────────────────
    case TYPE.Binary:
      return { name: "", baseType: "BLOB", sqlType: "BLOB", arrowType: at };

    // ── FixedSizeBinary (UUID or BLOB) ─────────────────────────────────────
    case TYPE.FixedSizeBinary: {
      const bw: number = at.byteWidth;
      if (bw === 16) {
        return { name: "", baseType: "UUID", sqlType: "UUID", arrowType: at };
      }
      return { name: "", baseType: "BLOB", sqlType: "BLOB", arrowType: at };
    }

    // ── Utf8 (VARCHAR, JSON, CHAR) ─────────────────────────────────────────
    case TYPE.Utf8: {
      // DuckDB may store JSON as Utf8 in Arrow. Check field metadata.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta: Record<string, string> = at?.metadata ?? (fieldType as any)?.metadata;
      const internalType = meta?.["DUCKDB:INTERNAL_TYPE"] ?? "";
      if (internalType.toLowerCase() === "json") {
        return { name: "", baseType: "JSON", sqlType: "JSON", arrowType: at };
      }
      return { name: "", baseType: "VARCHAR", sqlType: "VARCHAR", arrowType: at };
    }

    // ── List (ARRAY) ───────────────────────────────────────────────────────
    case TYPE.List: {
      const innerMeta = resolveType(at.valueType);
      const sqlType = `${innerMeta.sqlType}[]`;
      return { name: "", baseType: "ARRAY", sqlType, arrowType: at };
    }

    // ── Struct ─────────────────────────────────────────────────────────────
    case TYPE.Struct: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fields: any[] = at.fields ?? [];
      const fieldStrs = fields.map((f: { name: string; type: unknown }) => {
        const inner = resolveType(f.type);
        return `${f.name} ${inner.sqlType}`;
      });
      const sqlType = `STRUCT(${fieldStrs.join(", ")})`;
      return { name: "", baseType: "STRUCT", sqlType, arrowType: at };
    }

    // ── Map ────────────────────────────────────────────────────────────────
    case TYPE.Map: {
      const keyMeta = resolveType(at.keyType);
      const valMeta = resolveType(at.valueType);
      const sqlType = `MAP(${keyMeta.sqlType}, ${valMeta.sqlType})`;
      return { name: "", baseType: "MAP", sqlType, arrowType: at };
    }
  }

  // ── Fallback: try to classify from toString() ─────────────────────────
  if (typeStr.includes("interval")) {
    return { name: "", baseType: "INTERVAL", sqlType: "INTERVAL", arrowType: at };
  }
  if (typeStr.includes("json")) {
    return { name: "", baseType: "JSON", sqlType: "JSON", arrowType: at };
  }
  if (typeStr.includes("uuid")) {
    return { name: "", baseType: "UUID", sqlType: "UUID", arrowType: at };
  }
  if (typeStr.includes("blob") || typeStr === "binary") {
    return { name: "", baseType: "BLOB", sqlType: "BLOB", arrowType: at };
  }

  return { name: "", baseType: "UNKNOWN", sqlType: typeStr || "UNKNOWN", arrowType: at };
}

/**
 * Extract DuckDB column metadata from an Arrow schema field.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractColumnMeta(fieldName: string, fieldType: any): ColumnMeta {
  const meta = resolveType(fieldType);
  meta.name = fieldName;
  return meta;
}
