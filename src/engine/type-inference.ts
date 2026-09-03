/**
 * Type inference for CSV / JSON file imports.
 *
 * Pure helpers, fully isolated from SQL execution, used by the engine's
 * `importFile()` for both CSV and JSON data. Given the raw cell values of a
 * column, `inferColumnType()` picks the most specific DuckDB column type that
 * can safely hold every non-null value without losing data:
 *
 *   INTEGER   – all values are integers that fit in a 32-bit signed range
 *   BIGINT    – all values are integers that fit in a 64-bit signed range
 *   DOUBLE    – all values are numbers (integers and/or floating point)
 *   BOOLEAN   – all values are true / false
 *   DATE      – all values are YYYY-MM-DD calendar dates
 *   TIMESTAMP – all values are dates and/or date-times
 *   VARCHAR   – text, or any mixture that cannot be safely narrowed
 *
 * NULL/empty values never downgrade the inferred type (they map to SQL NULL
 * during insert). Incompatible mixtures (e.g. numbers + text, booleans +
 * dates) fall back to VARCHAR so no value is ever mangled or rejected.
 */

export type ImportColumnType =
  | "INTEGER"
  | "BIGINT"
  | "DOUBLE"
  | "BOOLEAN"
  | "DATE"
  | "TIMESTAMP"
  | "VARCHAR";

/** Raw cell values as produced by CSV/JSON parsing. */
export type ImportCellValue =
  | string
  | number
  | boolean
  | object
  | null
  | undefined;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
// ES2017 target: BigInt literals are unavailable, construct via strings.
const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

const INTEGER_RE = /^[+-]?\d+$/;
const FLOAT_RE =
  /^[+-]?(?:(?:\d+(?:\.\d+)?|\.\d+)[eE][+-]?\d+|\d+\.\d+|\.\d+)$/;
const BOOLEAN_RE = /^(?:true|false)$/i;
// "007"-style padded values are identifiers/codes, not numbers — keep them.
const PADDED_INT_RE = /^[+-]?0\d+$/;
const DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DATETIME_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Compatibility kind of a single value, used to merge column types. */
type Kind =
  | "null"
  | "int32"
  | "int64"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "text";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

/** Classify a single raw cell value into a compatibility kind. */
function classifyValue(value: ImportCellValue): Kind {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "text";
    if (Number.isInteger(value) && Number.isSafeInteger(value)) {
      return value >= INT32_MIN && value <= INT32_MAX ? "int32" : "int64";
    }
    return "float";
  }
  if (typeof value === "object") return "text"; // arrays / objects → JSON text

  const text = value.trim();
  if (BOOLEAN_RE.test(text)) return "boolean";
  if (INTEGER_RE.test(text)) {
    if (PADDED_INT_RE.test(text)) return "text"; // preserve "007" exactly
    let n: bigint;
    try {
      n = BigInt(text);
    } catch {
      return "text";
    }
    if (n >= INT64_MIN && n <= INT64_MAX) {
      return n >= BigInt(INT32_MIN) && n <= BigInt(INT32_MAX)
        ? "int32"
        : "int64";
    }
    return "text"; // beyond 64-bit: VARCHAR keeps the digits exact
  }
  if (FLOAT_RE.test(text)) return "float";

  const dateMatch = DATE_RE.exec(text);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    return isValidCalendarDate(year, month, day) ? "date" : "text";
  }

  const dtMatch = DATETIME_RE.exec(text);
  if (dtMatch) {
    const year = Number(dtMatch[1]);
    const month = Number(dtMatch[2]);
    const day = Number(dtMatch[3]);
    const hour = Number(dtMatch[4]);
    const minute = Number(dtMatch[5]);
    const second = dtMatch[6] === undefined ? 0 : Number(dtMatch[6]);
    if (
      isValidCalendarDate(year, month, day) &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59
    ) {
      return "datetime";
    }
  }

  return "text";
}

/**
 * Infer the DuckDB column type that can safely hold every non-null value.
 *
 * NULL values are ignored (they become SQL NULL and never widen the type).
 * Compatible kinds merge into a wider type (int32+int64 → BIGINT,
 * int+float → DOUBLE, date+datetime → TIMESTAMP); incompatible mixtures
 * resolve to VARCHAR so importing never fails or loses data.
 */
export function inferColumnType(
  values: ReadonlyArray<ImportCellValue>
): ImportColumnType {
  let sawNonNull = false;
  let hasText = false;
  let hasBool = false;
  let hasDate = false;
  let hasDatetime = false;
  let hasFloat = false;
  let anyInt = false;
  let anyBigInt = false;

  for (const value of values) {
    const kind = classifyValue(value);
    if (kind === "null") continue;
    sawNonNull = true;
    switch (kind) {
      case "int32":
        anyInt = true;
        break;
      case "int64":
        anyInt = true;
        anyBigInt = true;
        break;
      case "float":
        hasFloat = true;
        break;
      case "boolean":
        hasBool = true;
        break;
      case "date":
        hasDate = true;
        break;
      case "datetime":
        hasDatetime = true;
        break;
      case "text":
        hasText = true;
        break;
    }
  }

  if (!sawNonNull) return "VARCHAR";

  // Text always wins: mixing text with anything typed would corrupt or fail.
  if (hasText) return "VARCHAR";

  const hasNumeric = anyInt || hasFloat;
  const hasTemporal = hasDate || hasDatetime;
  if ((hasBool && (hasNumeric || hasTemporal)) || (hasNumeric && hasTemporal)) {
    return "VARCHAR";
  }

  if (hasBool) return "BOOLEAN";
  if (hasDatetime) return "TIMESTAMP";
  if (hasDate) return "DATE";
  if (hasFloat) return "DOUBLE";
  if (anyInt) return anyBigInt ? "BIGINT" : "INTEGER";
  return "VARCHAR";
}

function escapeSql(text: string): string {
  return text.replace(/'/g, "''");
}

/**
 * Render one cell as an SQL value literal for the given inferred column type.
 *
 * NULL/undefined become SQL NULL. VARCHAR values are quoted and escaped
 * (objects are JSON-stringified). Values for typed columns are validated by
 * `inferColumnType()` and emitted either as integer literals or explicit
 * `CAST('...' AS <type>)` expressions so DuckDB stores them typed.
 */
export function toSqlValue(
  cell: ImportCellValue,
  columnType: ImportColumnType
): string {
  if (cell === null || cell === undefined) return "NULL";

  if (columnType === "VARCHAR") {
    const text =
      typeof cell === "object" ? JSON.stringify(cell) : String(cell);
    return `'${escapeSql(text)}'`;
  }

  if (columnType === "INTEGER" || columnType === "BIGINT") {
    // Only validated integers reach this branch; normalize the textual form.
    const raw = String(cell).trim().replace(/^\+/, "");
    return BigInt(raw).toString();
  }

  // DOUBLE / BOOLEAN / DATE / TIMESTAMP
  let text = typeof cell === "string" ? cell.trim() : String(cell);
  if (columnType === "DOUBLE") {
    // ".5" is not a valid SQL float literal — normalize to "0.5".
    text = text.replace(/^([+-]?)\./, "$10.");
  }
  if (columnType === "BOOLEAN") {
    text = text.toLowerCase();
  }
  return `CAST('${escapeSql(text)}' AS ${columnType})`;
}
