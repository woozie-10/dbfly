/**
 * Dedicated Monarch tokenizer for DuckDB-flavored SQL.
 *
 * The editor registers this under its own language id (`dbfly-sql`) instead of
 * relying on monaco's built-in "sql" grammar that ships with the CDN build.
 * That makes highlighting deterministic — keywords such as JOIN / LEFT JOIN /
 * QUALIFY are always colorized regardless of which monaco version the loader
 * resolves, and DuckDB-specific words get proper treatment too.
 *
 * Token names deliberately match the tokens themed in `sql-editor.tsx`:
 * keyword, predefined, string, number, comment, identifier, operator,
 * delimiter, white.
 */

import type { languages } from "monaco-editor";

export const SQL_LANGUAGE_ID = "dbfly-sql";

/** SQL / DuckDB keywords that should be colorized as `keyword`. */
export const SQL_KEYWORDS: string[] = [
  // Query clauses & set operations
  "SELECT", "FROM", "WHERE", "AS", "ALL", "DISTINCT", "GROUP", "BY",
  "HAVING", "ORDER", "ASC", "DESC", "NULLS", "FIRST", "LAST", "LIMIT",
  "OFFSET", "FETCH", "UNION", "INTERSECT", "EXCEPT", "WITH", "RECURSIVE",
  "RETURNING",
  // Joins
  "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "NATURAL",
  "SEMI", "ANTI", "ASOF", "ON", "USING",
  // Predicates & expressions
  "AND", "OR", "NOT", "IN", "IS", "NULL", "BETWEEN", "LIKE", "ILIKE",
  "GLOB", "REGEXP", "SIMILAR", "CASE", "WHEN", "THEN", "ELSE", "END",
  "CAST", "TRY_CAST", "EXISTS", "ANY", "SOME", "FILTER", "OVERLAPS",
  // DDL / DML / misc statements
  "CREATE", "TABLE", "OR", "REPLACE", "TEMP", "TEMPORARY", "DROP",
  "ALTER", "ADD", "RENAME", "COLUMN", "INSERT", "INTO", "VALUES",
  "UPDATE", "SET", "DELETE", "TRUNCATE", "INDEX", "VIEW", "SCHEMA",
  "DATABASE", "IF", "PRIMARY", "KEY", "FOREIGN", "REFERENCES",
  "CONSTRAINT", "UNIQUE", "CHECK", "DEFAULT", "ATTACH", "DETACH", "COPY",
  "EXPORT", "IMPORT", "INSTALL", "LOAD", "CALL", "PRAGMA", "SHOW",
  "TABLES", "DESCRIBE", "EXPLAIN", "ANALYZE", "VACUUM", "PREPARE",
  "EXECUTE", "DEALLOCATE", "GRANT", "REVOKE", "TYPE", "ENUM", "SEQUENCE",
  "OWNED", "POLICY", "ROLE", "USER", "CURRENT", "GENERATED", "ALWAYS",
  "IDENTITY", "COLLATE", "CONFLICT", "DO", "NOTHING", "ONLY", "MATERIALIZED",
  "PERSISTENT", "TRANSACTION", "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT",
  "RELEASE", "RESET",
  // DuckDB-specific clauses
  "QUALIFY", "SAMPLE", "PIVOT", "UNPIVOT", "LATERAL", "WINDOW", "OVER",
  "PARTITION", "ROWS", "RANGE", "GROUPS", "UNBOUNDED", "PRECEDING",
  "FOLLOWING", "CURRENT", "ROW", "IGNORE", "RESPECT", "EXCLUDE", "OTHERS",
  "TIES", "MATCH", "CONDITIONAL", "CHANGE", "TRACKING", "SIMULATED",
  // Data types
  "BOOLEAN", "BOOL", "TINYINT", "SMALLINT", "INTEGER", "INT", "BIGINT",
  "HUGEINT", "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
  "FLOAT", "REAL", "DOUBLE", "DECIMAL", "NUMERIC", "VARCHAR", "CHAR",
  "BPCHAR", "TEXT", "STRING", "BLOB", "BYTEA", "BINARY", "VARBINARY",
  "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL", "UUID", "JSON",
  "STRUCT", "MAP", "LIST", "ARRAY", "BIT", "BITSTRING", "INET", "OID",
  // Literals
  "TRUE", "FALSE",
];

/** DuckDB built-ins that are not function calls (colorized as `predefined`). */
const SQL_BUILTINS: string[] = [
  "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP",
  "CURRENT_USER", "SESSION_USER", "LOCALTIME", "LOCALTIMESTAMP",
];

const SQL_LANGUAGE_CONF: languages.LanguageConfiguration = {
  comments: {
    lineComment: "--",
    blockComment: ["/*", "*/"],
  },
  brackets: [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ],
  autoClosingPairs: [
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
  ],
  surroundingPairs: [
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" },
  ],
};

const SQL_MONARCH: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".dbflysql",
  ignoreCase: true,
  brackets: [
    { open: "[", close: "]", token: "delimiter.square" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
    { open: "{", close: "}", token: "delimiter.curly" },
  ],
  keywords: SQL_KEYWORDS,
  builtins: SQL_BUILTINS,
  tokenizer: {
    root: [
      { include: "@whitespace" },
      { include: "@comments" },
      { include: "@numbers" },
      { include: "@strings" },
      { include: "@quotedIdentifiers" },
      [/[;,.]/, "delimiter"],
      [/[()]/, "@brackets"],
      // Words (incl. keywords). Monarches with `ignoreCase` compare the
      // matched text against the uppercase lists above.
      [/[\w@#$]+/, { cases: { "@builtins": "predefined", "@keywords": "keyword", "@default": "identifier" } }],
      [/[=<>!~?&|+\-*/%^:]+/, "operator"],
    ],
    whitespace: [[/\s+/, "white"]],
    comments: [
      [/--+.*/, "comment"],
      [/\/\*/, { token: "comment.quote", next: "@comment" }],
    ],
    comment: [
      [/[^*/]+/, "comment"],
      [/\*\//, { token: "comment.quote", next: "@pop" }],
      [/./, "comment"],
    ],
    numbers: [
      [/0[xX][0-9a-fA-F]+/, "number"],
      [/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/, "number"],
    ],
    strings: [
      [/'/, { token: "string", next: "@string" }],
    ],
    string: [
      [/[^']+/, "string"],
      [/''/, "string"],
      [/'/, { token: "string", next: "@pop" }],
    ],
    quotedIdentifiers: [
      [/"/, { token: "identifier.quote", next: "@quotedIdentifier" }],
    ],
    quotedIdentifier: [
      [/[^"]+/, "identifier"],
      [/""/, "identifier"],
      [/"/, { token: "identifier.quote", next: "@pop" }],
    ],
  },
};

/**
 * Register the editor's SQL language (idempotent-safe for the caller).
 * Should be called once, before the editor model is created, via
 * `<Editor beforeMount={...} />`.
 */
export function registerSqlLanguage(monaco: any): void {
  monaco.languages.register({ id: SQL_LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(SQL_LANGUAGE_ID, SQL_LANGUAGE_CONF);
  monaco.languages.setMonarchTokensProvider(SQL_LANGUAGE_ID, SQL_MONARCH);
}
