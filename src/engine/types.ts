/**
 * Generic database engine interface.
 * DuckDB-Wasm is the first implementation.
 * Future: PostgreSQL, MySQL, SQLite, MSSQL.
 */

/** Column type metadata for rendering */
export type ColumnType =
  | "string"
  | "boolean"
  | "integer"
  | "float"
  | "decimal"
  | "bigint"
  | "hugeint"
  | "date"
  | "timestamp"
  | "time"
  | "interval"
  | "binary"
  | "uuid"
  | "json"
  | "unknown";

export interface QueryResult {
  columns: string[];
  /** Column type hints for rendering */
  columnTypes: ColumnType[];
  /** DuckDB SQL type strings for each column (e.g. "DECIMAL(18,4)", "TIMESTAMP") */
  sqlTypes: string[];
  /** Each cell can be: string | number | boolean | null | object (JSON/STRUCT) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: (string | number | boolean | null | Record<string, any>)[][];
  rowCount: number;
  executionTimeMs: number;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface ForeignKey {
  /** Column(s) in this table */
  fromColumns: string[];
  /** Referenced table */
  referencedTable: string;
  /** Referenced column(s) */
  referencedColumns: string[];
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  foreignKeys: ForeignKey[];
  rowCount?: number;
}

export interface ForeignKeyWithTable extends ForeignKey {
  fromTable: string;
}

export interface SchemaInfo {
  tables: SchemaTable[];
  relationships: ForeignKeyWithTable[];
}

export interface DatabaseEngine {
  /** Human-readable name of the engine (e.g. "DuckDB-Wasm") */
  readonly name: string;

  /** Initialize the engine (load WASM, open connection, etc.) */
  initialize(): Promise<void>;

  /** Run a SQL query and return results */
  query(sql: string): Promise<QueryResult>;

  /** Get schema information for all tables */
  getSchema(): Promise<SchemaInfo>;

  /** Dispose of any resources */
  dispose(): Promise<void>;
}
