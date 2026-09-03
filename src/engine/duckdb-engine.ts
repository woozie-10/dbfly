import * as duckdb from "@duckdb/duckdb-wasm";
import type {
  DatabaseEngine,
  QueryResult,
  ColumnType,
  SchemaInfo,
  SchemaTable,
  SchemaColumn,
} from "./types";
import { extractColumnMeta, type ColumnMeta } from "./column-meta";
import { formatCellValue, type CellValue } from "./format-cell";
import {
  inferColumnType,
  toSqlValue,
  type ImportCellValue,
} from "./type-inference";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript",
      })
    );
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    return db;
  })();

  return dbPromise;
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }
    // Skip single-line comments (-- ...)
    if (ch === "-" && i + 1 < sql.length && sql[i + 1] === "-" && !inSingleQuote && !inDoubleQuote) {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    // Skip block comments (/* ... */)
    if (ch === "/" && i + 1 < sql.length && sql[i + 1] === "*" && !inSingleQuote && !inDoubleQuote) {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && i + 1 < sql.length && sql[i + 1] === "/")) i++;
      i += 1; // skip past the closing /
      continue;
    }
    if (ch === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

function isSelectStatement(sql: string): boolean {
  const upper = sql.toUpperCase().trimStart();
  return (
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("EXPLAIN") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("DESCRIBE") ||
    upper.startsWith("PRAGMA")
  );
}

/** Detect EXPLAIN / EXPLAIN ANALYZE */
function isExplain(sql: string): boolean {
  return sql.toUpperCase().trimStart().startsWith("EXPLAIN");
}

/** Strip EXPLAIN prefix and return the inner SQL + whether ANALYZE is set */
function parseExplain(sql: string): { inner: string; analyze: boolean } {
  let s = sql.trim();
  const upper = s.toUpperCase();
  const analyze = upper.includes("ANALYZE");
  // Remove EXPLAIN [ANALYZE]
  s = s.replace(/^EXPLAIN\s*(ANALYZE)?\s*/i, "");
  return { inner: s, analyze };
}

/** Simple CSV parser for import */
function parseCsvContent(content: string): { headers: string[]; rows: (string | null)[][] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else if (ch === "\r") {
      // skip
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return { headers: [], rows: [] };
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
      } else if (ch === "," && !inFieldQuotes) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// Map DuckDBBaseType to the legacy ColumnType (for results-table rendering)
// ═══════════════════════════════════════════════════════════════════════════════

import type { DuckDBBaseType } from "./column-meta";

const BASE_TO_LEGACY: Record<DuckDBBaseType, ColumnType> = {
  BOOLEAN:     "boolean",
  TINYINT:     "integer",
  SMALLINT:    "integer",
  INTEGER:     "integer",
  BIGINT:      "bigint",
  HUGEINT:     "hugeint",
  UTINYINT:    "integer",
  USMALLINT:   "integer",
  UINTEGER:    "integer",
  UBIGINT:     "bigint",
  UHUGEINT:    "hugeint",
  FLOAT:       "float",
  DOUBLE:      "float",
  DECIMAL:     "decimal",
  VARCHAR:     "string",
  CHAR:        "string",
  BLOB:        "binary",
  DATE:        "date",
  TIME:        "time",
  TIMESTAMPTZ: "timestamp",
  TIMESTAMP_S: "timestamp",
  TIMESTAMP_MS: "timestamp",
  TIMESTAMP_US: "timestamp",
  TIMESTAMP_NS: "timestamp",
  INTERVAL:    "interval",
  UUID:        "uuid",
  JSON:        "json",
  STRUCT:      "string",
  MAP:         "string",
  ARRAY:       "string",
  UNKNOWN:     "unknown",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Table conversion — uses centralized formatCellValue
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableToRows(table: any): {
  rows: CellValue[][];
  columnTypes: ColumnType[];
  sqlTypes: string[];
  colMetas: ColumnMeta[];
} {
  const fields: { name: string; type: unknown }[] = table.schema.fields;
  const numRows = Number(table.numRows);

  // Extract metadata for each column
  const colMetas: ColumnMeta[] = fields.map((f) =>
    extractColumnMeta(f.name as string, f.type)
  );

  // ── Pre-extract raw buffers for types where vec.get() loses precision ──
  // DuckDB-Wasm's vec.get() converts BigInt64/Int32 to JavaScript Number,
  // losing precision for INTERVAL (128-bit) and TIMESTAMP_NS (64-bit nanos).
  // We read directly from data.values (the Arrow buffer) instead.
  //
  // IMPORTANT: Use index-based access (table.getChildAt(ci)) throughout.
  // name-based access (table.getChild(name)) returns the FIRST match,
  // which breaks when a JOIN produces duplicate column names (e.g. two "name").
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vecs: any[] = [];
  const intervalVecs: Map<number, { values: Int32Array; offset: number }> = new Map();
  const rawBigIntVecs: Map<number, { values: any; offset: number }> = new Map();
  for (let ci = 0; ci < colMetas.length; ci++) {
    const vec = table.getChildAt(ci);
    vecs.push(vec);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataObj: any = vec?.data?.[0];
    if (!dataObj) continue;

    if (colMetas[ci].baseType === "INTERVAL" && dataObj.values instanceof Int32Array) {
      intervalVecs.set(ci, {
        values: dataObj.values,
        offset: dataObj.offset || 0,
      });
    }

    // Detect BigInt64Array via duck-typing (cross-realm safe).
    if (dataObj.values && typeof dataObj.values === "object" && typeof dataObj.values.byteLength === "number") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tag = dataObj.values[Symbol.toStringTag];
      if (tag === "BigInt64Array") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fieldType: any = fields[ci].type;
        const fieldStr = String(fieldType?.toString?.() ?? "").toLowerCase();
        const fieldUnit = String(fieldType?.unit ?? "").toLowerCase();
        const isNs = fieldStr.includes("nanosecond") || fieldUnit === "nanosecond";
        if (isNs) {
          rawBigIntVecs.set(ci, {
            values: dataObj.values,
            offset: dataObj.offset || 0,
          });
          if (colMetas[ci].baseType !== "TIMESTAMP_NS") {
            colMetas[ci].baseType = "TIMESTAMP_NS";
            colMetas[ci].sqlType = "TIMESTAMP_NS";
          }
        }
      }
    }
  }

  const rows: CellValue[][] = [];

  for (let r = 0; r < numRows; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < colMetas.length; c++) {
      const meta = colMetas[c];

      // ── Nanosecond timestamp: read BigInt64 from Arrow buffer ──
      const rawBig = rawBigIntVecs.get(c);
      if (rawBig) {
        const rawNs = rawBig.values[rawBig.offset + r];
        row.push(formatCellValue(rawNs, meta));
        continue;
      }

      // ── Interval: read from raw buffer ──
      if (meta.baseType === "INTERVAL") {
        const iv = intervalVecs.get(c);
        if (iv) {
          const base = iv.offset + r * 4;
          const months = iv.values[base + 0];
          const days = iv.values[base + 1];
          const nanosLo = iv.values[base + 2] >>> 0;
          const nanosHi = iv.values[base + 3];
          const nanos = BigInt(nanosHi) * BigInt(4294967296) + BigInt(nanosLo);
          const totalSec = Number(nanos / BigInt(1000000000));
          const hours = Math.floor(totalSec / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          const secs = totalSec % 60;
          const parts: string[] = [];
          if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
          if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
          if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
          if (mins) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
          if (secs || parts.length === 0) parts.push(`${secs} ${secs === 1 ? "second" : "seconds"}`);
          row.push(parts.join(" "));
          continue;
        }
      }

      const vec = vecs[c];
      const rawValue = vec ? vec.get(r) : null;
      row.push(formatCellValue(rawValue, meta));
    }
    rows.push(row);
  }

  return {
    rows,
    columnTypes: colMetas.map((m) => BASE_TO_LEGACY[m.baseType] ?? "unknown"),
    sqlTypes: colMetas.map((m) => m.sqlType),
    colMetas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// DuckDB Engine
// ═══════════════════════════════════════════════════════════════════════════════

export class DuckDBEngine implements DatabaseEngine {
  readonly name = "DuckDB-Wasm";
  private conn: duckdb.AsyncDuckDBConnection | null = null;

  async initialize(): Promise<void> {
    const db = await getDB();
    this.conn = await db.connect();
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.conn)
      throw new Error("Engine not initialized. Call initialize() first.");

    const statements = splitStatements(sql);
    if (statements.length === 0) {
      throw new Error("No SQL statement provided.");
    }

    const start = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastSelect: any = null;

    for (const stmt of statements) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await this.conn.query(stmt);
      if (isSelectStatement(stmt)) {
        lastSelect = result;
      }
    }

    if (!lastSelect) {
      return {
        columns: [],
        columnTypes: [],
        sqlTypes: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: performance.now() - start,
      };
    }

    const columns: string[] = lastSelect.schema.fields.map(
      (f: { name: string }) => f.name
    );

    const { rows, columnTypes, sqlTypes } = tableToRows(lastSelect);

    const executionTimeMs = performance.now() - start;

    return {
      columns,
      columnTypes,
      sqlTypes,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  }

  /**
   * Run EXPLAIN or EXPLAIN ANALYZE and return the plan as a QueryResult.
   * The plan text is returned as rows with columns: ["Plan"]
   */
  async queryExplain(sql: string): Promise<QueryResult> {
    if (!this.conn)
      throw new Error("Engine not initialized. Call initialize() first.");

    const start = performance.now();
    const { inner, analyze } = parseExplain(sql);
    const explainSql = analyze ? `EXPLAIN ANALYZE ${inner}` : `EXPLAIN ${inner}`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await this.conn.query(explainSql);
      const columns = ["Plan"];
      const rows: string[][] = [];
      const numRows = Number(result.numRows);
      const vec = result.getChildAt(0);
      for (let r = 0; r < numRows; r++) {
        const val = vec?.get(r);
        rows.push([val != null ? String(val) : ""]);
      }
      return {
        columns,
        columnTypes: ["string"],
        sqlTypes: ["VARCHAR"],
        rows,
        rowCount: rows.length,
        executionTimeMs: performance.now() - start,
      };
    } catch (err) {
      // Re-throw so the UI can display the error
      throw err;
    }
  }

  /**
   * Import a CSV or JSON file into DuckDB as a table.
   * Parses in JS, infers a safe column type per column from the actual
   * values, creates the typed table, and inserts via batched statements.
   * Returns the table name and row count.
   */
  async importFile(
    _fileName: string,
    fileContent: string,
    tableName: string,
    fileType: "csv" | "json"
  ): Promise<{ tableName: string; rowCount: number }> {
    if (!this.conn)
      throw new Error("Engine not initialized. Call initialize() first.");

    // ── 1. Parse into headers + raw cell values ──
    let headers: string[];
    let rawRows: Array<Array<unknown>>;

    if (fileType === "csv") {
      const parsed = parseCsvContent(fileContent);
      if (parsed.headers.length === 0)
        throw new Error("CSV file is empty or has no headers");
      headers = parsed.headers;
      rawRows = parsed.rows;
    } else {
      const data = JSON.parse(fileContent);
      const arr = Array.isArray(data) ? data : [data];
      if (arr.length === 0) throw new Error("JSON file contains no data");
      // Collect all keys across objects (missing fields become NULL)
      const headerSet = new Set<string>();
      for (const obj of arr) {
        if (typeof obj === "object" && obj !== null) {
          for (const key of Object.keys(obj)) headerSet.add(key);
        }
      }
      headers = Array.from(headerSet);
      rawRows = arr.map((obj) =>
        headers.map((h) => (obj as Record<string, unknown>)?.[h])
      );
    }

    // ── 2. Normalize cells: CSV empty fields mean NULL (as before); JSON
    //        keeps real empty strings, only null/undefined map to NULL. ──
    const rows: ImportCellValue[][] = rawRows.map((row) =>
      headers.map((_, j) => {
        const v = row[j];
        if (v === null || v === undefined) return null;
        if (fileType === "csv" && v === "") return null;
        return v as ImportCellValue;
      })
    );

    // ── 3. Infer one DuckDB type per column across all rows ──
    const columnTypes = headers.map((_, j) =>
      inferColumnType(rows.map((row) => row[j]))
    );

    // ── 4. Create the typed table ──
    const colDefs = headers
      .map((h, j) => `"${h}" ${columnTypes[j]}`)
      .join(", ");
    await this.conn.query(`CREATE OR REPLACE TABLE "${tableName}" (${colDefs})`);

    // ── 5. Batch INSERT (NULLs preserved, typed literals emitted) ──
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = batch
        .map(
          (row) =>
            `(${headers
              .map((_, j) => toSqlValue(row[j], columnTypes[j]))
              .join(", ")})`
        )
        .join(",\n");
      await this.conn.query(`INSERT INTO "${tableName}" VALUES ${values}`);
    }

    // ── 6. Row count ──
    const countResult = await this.conn.query(
      `SELECT COUNT(*) AS cnt FROM "${tableName}"`
    );
    const cnt = Number(countResult.getChildAt(0)?.get(0) ?? 0);

    return { tableName, rowCount: cnt };
  }

  /**
   * Get the raw DuckDB connection (for export utilities).
   */
  getConnection(): duckdb.AsyncDuckDBConnection | null {
    return this.conn;
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.conn) throw new Error("Engine not initialized.");

    // Use raw conn.query() throughout to avoid formatCellValue mangling values.
    const showResult = await this.conn.query("SHOW TABLES");
    const tableNames: string[] = [];
    const firstColName = showResult.schema.fields[0]?.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tblVec: any = showResult.getChild("name") ?? showResult.getChild("table_name") ?? (firstColName ? showResult.getChild(firstColName) : null);
    if (tblVec) {
      for (let r = 0; r < Number(showResult.numRows); r++) {
        tableNames.push(String(tblVec.get(r)));
      }
    }

    // Fetch primary keys
    const pkMap = new Map<string, Set<string>>();
    try {
      const pkResult = await this.conn.query(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
         ORDER BY tc.table_name, kcu.ordinal_position`
      );
      const tblCol = pkResult.getChild("table_name");
      const colCol = pkResult.getChild("column_name");
      if (tblCol && colCol) {
        for (let r = 0; r < Number(pkResult.numRows); r++) {
          const tbl = String(tblCol.get(r));
          const col = String(colCol.get(r));
          if (!pkMap.has(tbl)) pkMap.set(tbl, new Set());
          pkMap.get(tbl)!.add(col);
        }
      }
    } catch {
      // information_schema may not be available
    }

    // Fetch foreign keys using duckdb_constraints() — the only reliable method
    // in DuckDB-Wasm. information_schema.constraint_column_usage is broken
    // (returns FK table's own columns instead of the referenced PK columns).
    const fkMap = new Map<string, Array<{ fromColumns: string[]; referencedTable: string; referencedColumns: string[] }>>();
    try {
      const fkResult = await this.conn.query(
        `SELECT table_name, constraint_column_names, referenced_table, referenced_column_names
         FROM duckdb_constraints()
         WHERE constraint_type = 'FOREIGN KEY'`
      );
      const tableNameVec = fkResult.getChild("table_name");
      const fromColsVec = fkResult.getChild("constraint_column_names");
      const refTableVec = fkResult.getChild("referenced_table");
      const refColsVec = fkResult.getChild("referenced_column_names");
      if (tableNameVec && fromColsVec && refTableVec && refColsVec) {
        for (let r = 0; r < Number(fkResult.numRows); r++) {
          const fromTable = String(tableNameVec.get(r));
          const fromColsRaw = String(fromColsVec.get(r)); // e.g. "[order_id]"
          const toTable = String(refTableVec.get(r));
          const toColsRaw = String(refColsVec.get(r));   // e.g. "[order_id]"
          if (!fromTable || !toTable) continue;
          // Parse DuckDB array literals: "[order_id]" → ["order_id"]
          const fromCols = fromColsRaw.replace(/[[\]]/g, "").split(",").map((s) => s.trim());
          const toCols = toColsRaw.replace(/[[\]]/g, "").split(",").map((s) => s.trim());
          const existingTable = fkMap.get(fromTable)?.find((fk) => fk.referencedTable === toTable);
          if (existingTable) {
            existingTable.fromColumns.push(...fromCols);
            existingTable.referencedColumns.push(...toCols);
          } else {
            if (!fkMap.has(fromTable)) fkMap.set(fromTable, []);
            fkMap.get(fromTable)!.push({
              fromColumns: fromCols,
              referencedTable: toTable,
              referencedColumns: toCols,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[Schema] FK query failed:", err);
    }

    // Fetch table details
    const tables: SchemaTable[] = [];
    for (const tableName of tableNames) {
      try {
        const descResult = await this.conn.query(`DESCRIBE "${tableName}"`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameVec: any = descResult.getChild("column_name") ?? descResult.getChild(descResult.schema.fields[0]?.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeVec: any = descResult.getChild("column_type") ?? descResult.getChild(descResult.schema.fields[1]?.name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nullVec: any = descResult.getChild("null");
        const columns: SchemaColumn[] = [];
        if (nameVec && typeVec) {
          for (let r = 0; r < Number(descResult.numRows); r++) {
            columns.push({
              name: String(nameVec.get(r)),
              type: String(typeVec.get(r)),
              nullable: String(nullVec?.get(r) ?? "") === "YES",
              isPrimaryKey: pkMap.get(tableName)?.has(String(nameVec.get(r))) ?? false,
            });
          }
        }

        const foreignKeys = fkMap.get(tableName) ?? [];

        // Get row count
        let rowCount: number | undefined;
        try {
          const countResult = await this.conn.query(`SELECT COUNT(*) AS cnt FROM "${tableName}"`);
          const cntCol = countResult.getChild("cnt");
          rowCount = Number(cntCol?.get(0) ?? 0);
        } catch {
          // ignore
        }

        tables.push({ name: tableName, columns, foreignKeys, rowCount });
      } catch {
        // Skip tables that can't be described
      }
    }

    // Build flat relationships list
    const relationships: SchemaInfo["relationships"] = [];
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        relationships.push({ ...fk, fromTable: table.name });
      }
    }

    return { tables, relationships };
  }

  async dispose(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
  }
}
