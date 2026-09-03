import type { editor, languages } from "monaco-editor";
import type { SchemaInfo } from "@/engine/types";

// Live schema seen by the completion provider.
//
// The provider is registered once per page lifetime (see sql-editor.tsx), so
// it must NOT be bound to a single editor instance's React ref — that ref goes
// stale when the editor remounts (StrictMode double-mount, Diagram view
// toggle) and table suggestions would silently stop appearing. Instead the
// mounted editor pushes the latest schema here on every change.
let currentSchema: SchemaInfo | null = null;

/** Update the schema used by completion providers registered without an explicit getter. */
export function setCompletionSchema(schema: SchemaInfo | null): void {
  currentSchema = schema;
}

/** SQL keywords */
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN",
  "LIKE", "IS", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT",
  "INNER", "OUTER", "FULL", "CROSS", "GROUP", "BY", "ORDER",
  "ASC", "DESC", "HAVING", "LIMIT", "OFFSET", "DISTINCT", "ALL",
  "UNION", "INTERSECT", "EXCEPT", "INSERT", "INTO", "VALUES",
  "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER",
  "ADD", "COLUMN", "INDEX", "VIEW", "IF", "EXISTS", "REPLACE",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "CONSTRAINT",
  "DEFAULT", "UNIQUE", "CHECK",
  "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT",
  "VARCHAR", "CHAR", "TEXT", "BLOB",
  "DECIMAL", "NUMERIC", "FLOAT", "DOUBLE", "REAL",
  "DATE", "TIME", "TIMESTAMP", "DATETIME", "INTERVAL",
  "BOOLEAN", "BOOL", "UUID",
  "WITH", "RECURSIVE", "EXPLAIN", "ANALYZE",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "TRUE", "FALSE",
  "COMMIT", "ROLLBACK", "BEGIN", "TRANSACTION",
  "TRUNCATE", "SHOW", "TABLES", "DESCRIBE",
  // Window-related
  "OVER", "PARTITION", "RANGE", "ROWS", "UNBOUNDED",
  "PRECEDING", "FOLLOWING", "CURRENT", "ROW",
  "WINDOW", "QUALIFY",
  "SAMPLE", "USING", "LATERAL", "NATURAL",
];

/** Standard SQL functions */
const SQL_FUNCTIONS = [
  "COUNT", "SUM", "AVG", "MIN", "MAX",
  "ABS", "CEIL", "CEILING", "FLOOR", "ROUND",
  "UPPER", "LOWER", "TRIM", "LTRIM", "RTRIM", "LENGTH",
  "SUBSTRING", "SUBSTR", "REPLACE", "CONCAT",
  "NOW", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP",
  "COALESCE", "NULLIF", "IFNULL",
  "CAST", "EXTRACT",
  "REGEXP_REPLACE", "REGEXP_MATCHES",
];

/** DuckDB-specific functions */
const DUCKDB_FUNCTIONS = [
  // DuckDB aggregate
  "GROUP_CONCAT",
  "APPROX_COUNT_DISTINCT", "APPROX_PERCENTILE",
  "MEDIAN", "QUANTILE", "STDDEV", "STDDEV_POP", "STDDEV_SAMP",
  "VAR_POP", "VAR_SAMP", "VARIANCE",
  "BOOL_AND", "BOOL_OR",
  // DuckDB window
  "ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE",
  "LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE",
  "PERCENT_RANK", "CUME_DIST",
  // DuckDB string
  "INITCAP", "CONTAINS", "STARTS_WITH", "ENDS_WITH",
  "REGEXP_REPLACE", "REGEXP_MATCHES", "REGEXP_EXTRACT",
  "STRING_AGG", "CONCAT_WS",
  // DuckDB array / list
  "ARRAY", "LIST", "ARRAY_AGG", "LIST_AGG",
  "ARRAY_LENGTH", "LIST_SIZE", "ARRAY_CONTAINS", "LIST_CONTAINS",
  "ARRAY_FILTER", "LIST_FILTER", "ARRAY_TRANSFORM", "LIST_TRANSFORM",
  "ARRAY_FLATTEN", "UNNEST", "GENERATE_SERIES",
  // DuckDB struct / JSON
  "STRUCT", "STRUCT_EXTRACT", "JSON_EXTRACT",
  "JSON_KEYS", "JSON_LENGTH", "JSON_VALID", "TO_JSON", "FROM_JSON",
  // DuckDB date/time
  "DATE_TRUNC", "DATE_PART", "DATE_EXTRACT", "DATE_DIFF",
  "DATE_ADD", "DATE_SUB", "DATE_FORMAT", "DATE_STR",
  "TIMESTAMP_TRUNC", "TIMESTAMPDIFF", "TIMESTAMPADD",
  "MAKE_DATE", "MAKE_TIMESTAMP", "MAKE_INTERVAL",
  "TO_DATE", "TO_TIMESTAMP", "TO_TIMESTAMP_TZ",
  "STRFTIME", "STRPTIME",
  // DuckDB utility
  "TYPEOF", "HASH", "MD5", "SHA256",
  "CURRENT_DATABASE", "CURRENT_SCHEMA",
  "ZEROIFNULL", "NANVL",
  "TRY_CAST",
  "GREATEST", "LEAST",
  "FORMAT",
  // DuckDB-specific
  "DUCKDB_VERSION", "LIST_SORT", "LIST_REVERSE",
  "STR_SPLIT", "STRING_SPLIT", "STRING_TO_ARRAY",
  "REGEXP_EXTRACT_ALL",
  "AGE",
  "MAKE_TIMESTAMPTZ",
];

/** SQL snippet templates */
const SQL_SNIPPETS: { label: string; detail: string; insertText: string }[] = [
  {
    label: "OVER (PARTITION BY ... ORDER BY ...)",
    detail: "window clause",
    insertText: "OVER (PARTITION BY ${1:column} ORDER BY ${2:column})",
  },
  {
    label: "PARTITION BY ... ORDER BY ...",
    detail: "partition and order",
    insertText: "PARTITION BY ${1:column} ORDER BY ${2:column}",
  },
  {
    label: "OVER (ORDER BY ... ROWS BETWEEN ...)",
    detail: "window frame",
    insertText: "OVER (ORDER BY ${1:column} ROWS BETWEEN ${2:UNBOUNDED PRECEDING} AND ${3:CURRENT ROW})",
  },
  {
    label: "OVER (PARTITION BY ... ROWS BETWEEN ...)",
    detail: "partitioned window frame",
    insertText: "OVER (PARTITION BY ${1:column} ORDER BY ${2:column} ROWS BETWEEN ${3:UNBOUNDED PRECEDING} AND ${4:CURRENT ROW})",
  },
  {
    label: "WITH ... AS (...)",
    detail: "CTE definition",
    insertText: "WITH ${1:cte_name} AS (\n  SELECT ${2:columns}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT * FROM ${1:cte_name}",
  },
  {
    label: "SELECT ... FROM ... WHERE ...",
    detail: "basic query",
    insertText: "SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition}",
  },
  {
    label: "SELECT ... FROM ... JOIN ... ON ...",
    detail: "query with join",
    insertText: "SELECT ${1:columns}\nFROM ${2:table1} t1\nJOIN ${3:table2} t2 ON t1.${4:id} = t2.${5:id}",
  },
  {
    label: "INSERT INTO ... VALUES (...)",
    detail: "insert statement",
    insertText: "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values})",
  },
  {
    label: "CREATE TABLE ... (...)",
    detail: "create table",
    insertText: "CREATE TABLE ${1:table_name} (\n  ${2:id} INTEGER PRIMARY KEY,\n  ${3:column} ${4:VARCHAR}\n)",
  },
  {
    label: "GROUP BY ... HAVING ...",
    detail: "group by with filter",
    insertText: "GROUP BY ${1:columns}\nHAVING ${2:condition}",
  },
  {
    label: "CASE WHEN ... THEN ... ELSE ... END",
    detail: "case expression",
    insertText: "CASE WHEN ${1:condition} THEN ${2:value}\n     WHEN ${3:condition} THEN ${4:value}\n     ELSE ${5:default}\nEND",
  },
  {
    label: "COALESCE(...)",
    detail: "coalesce expression",
    insertText: "COALESCE(${1:column}, ${2:default})",
  },
  {
    label: "CAST(... AS ...)",
    detail: "type cast",
    insertText: "CAST(${1:column} AS ${2:INTEGER})",
  },
  {
    label: "EXTRACT(... FROM ...)",
    detail: "extract date part",
    insertText: "EXTRACT(${1:YEAR} FROM ${2:column})",
  },
  {
    label: "DATE_TRUNC(..., ...)",
    detail: "truncate date",
    insertText: "DATE_TRUNC('${1:month}', ${2:column})",
  },
  {
    label: "SUBSTRING(... FROM ... FOR ...)",
    detail: "substring",
    insertText: "SUBSTRING(${1:column} FROM ${2:1} FOR ${3:10})",
  },
  {
    label: "QUALIFY ...",
    detail: "qualify filter (DuckDB)",
    insertText: "QUALIFY ${1:ROW_NUMBER()} OVER (PARTITION BY ${2:column} ORDER BY ${3:column}) = 1",
  },
];

// ── CTE name extraction ────────────────────────────────────────────────────

/**
 * Parse the full SQL text and extract CTE names from WITH ... AS (...) clauses.
 * Handles both recursive and non-recursive CTEs.
 */
function extractCteNames(fullSql: string): string[] {
  const names: string[] = [];
  const upperSql = fullSql.toUpperCase();
  let searchFrom = upperSql.indexOf("WITH");
  if (searchFrom === -1) return names;
  searchFrom += 4;

  const afterWith = upperSql.substring(searchFrom).trimStart();
  if (afterWith.startsWith("RECURSIVE")) {
    searchFrom = upperSql.indexOf("RECURSIVE", searchFrom) + 9;
  }

  const ctePattern = /\b([a-zA-Z_]\w*)\s+AS\s*\(/gi;
  ctePattern.lastIndex = searchFrom;

  let match: RegExpExecArray | null;
  while ((match = ctePattern.exec(fullSql)) !== null) {
    const name = match[1];
    const upper = name.toUpperCase();
    if (
      upper === "SELECT" || upper === "FROM" || upper === "WHERE" ||
      upper === "JOIN" || upper === "ON" || upper === "GROUP" ||
      upper === "ORDER" || upper === "HAVING" || upper === "LIMIT" ||
      upper === "UNION" || upper === "INTERSECT" || upper === "EXCEPT"
    ) {
      continue;
    }
    names.push(name);
  }

  return names;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCompletionProvider(
  monaco: any,
  getSchema?: () => SchemaInfo | null,
  languageId = "sql"
) {
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", " ", "(", ","],
    provideCompletionItems: (
      model: editor.ITextModel,
      position: { lineNumber: number; column: number }
    ): languages.CompletionList => {
      const schema = getSchema ? getSchema() : currentSchema;
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      const suggestions: languages.CompletionItem[] = [];

      // Full text for CTE extraction
      const fullSql = model.getValue();

      // Determine context: are we after a dot? (table.column)
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);
      const dotMatch = textBeforeCursor.match(/(\w+)\.$/);

      if (dotMatch) {
        // Table.column completion
        const aliasOrTable = dotMatch[1].toUpperCase();
        if (schema) {
          for (const table of schema.tables) {
            if (
              table.name.toUpperCase() === aliasOrTable ||
              table.name.toUpperCase().startsWith(aliasOrTable)
            ) {
              for (const col of table.columns) {
                suggestions.push({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  detail: col.type,
                  insertText: col.name,
                  range,
                });
              }
            }
          }
        }
        return { suggestions };
      }

      // ── Window clause context ───────────────────────────────────────
      const trailingWord = textBeforeCursor.trimEnd().split(/\s+/).pop()?.toUpperCase() ?? "";

      // After OVER: suggest (PARTITION BY ... ORDER BY ...)
      if (trailingWord === "OVER") {
        suggestions.push({
          label: "(PARTITION BY ... ORDER BY ...)",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "window specification",
          insertText: "(PARTITION BY ${1:column} ORDER BY ${2:column})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
        suggestions.push({
          label: "(ORDER BY ... ROWS BETWEEN ... AND ...)",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "window with frame",
          insertText: "(ORDER BY ${1:column} ROWS BETWEEN ${2:UNBOUNDED PRECEDING} AND ${3:CURRENT ROW})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
        return { suggestions };
      }

      // After PARTITION: suggest BY
      if (trailingWord === "PARTITION") {
        suggestions.push({
          label: "BY",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: "BY ",
          range,
        });
        return { suggestions };
      }

      // After ROWS / RANGE / GROUPS: suggest BETWEEN ... AND
      if (trailingWord === "ROWS" || trailingWord === "RANGE" || trailingWord === "GROUPS") {
        suggestions.push({
          label: "BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "frame start to current row",
          insertText: "BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW",
          range,
        });
        suggestions.push({
          label: "BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "entire partition",
          insertText: "BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING",
          range,
        });
        suggestions.push({
          label: "BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "current row to end",
          insertText: "BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING",
          range,
        });
        suggestions.push({
          label: "BETWEEN N PRECEDING AND CURRENT ROW",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "sliding window",
          insertText: "BETWEEN ${1:1} PRECEDING AND CURRENT ROW",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
        suggestions.push({
          label: "BETWEEN N PRECEDING AND N FOLLOWING",
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: "sliding window",
          insertText: "BETWEEN ${1:1} PRECEDING AND ${2:1} FOLLOWING",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
        return { suggestions };
      }

      // ── Keywords ─────────────────────────────────────────────────────
      for (const kw of SQL_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }

      // ── Standard functions ───────────────────────────────────────────
      for (const fn of SQL_FUNCTIONS) {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: "function",
          insertText: `${fn}($1)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }

      // ── Snippets ────────────────────────────────────────────────────
      for (const snippet of SQL_SNIPPETS) {
        suggestions.push({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }

      // ── DuckDB-specific functions ───────────────────────────────────
      for (const fn of DUCKDB_FUNCTIONS) {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: "DuckDB function",
          insertText: `${fn}($1)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }

      // ── Table names ──────────────────────────────────────────────────
      if (schema) {
        for (const table of schema.tables) {
          suggestions.push({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: `table (${table.columns.length} columns)`,
            insertText: table.name,
            range,
          });
        }
      }

      // ── CTE names ────────────────────────────────────────────────────
      const cteNames = extractCteNames(fullSql);
      for (const cteName of cteNames) {
        suggestions.push({
          label: cteName,
          kind: monaco.languages.CompletionItemKind.Reference,
          detail: "CTE",
          insertText: cteName,
          range,
        });
      }

      // Deduplicate by label — Monaco's built-in may also suggest words
      const seen = new Set<string>();
      const unique: languages.CompletionItem[] = [];
      for (const s of suggestions) {
        const key = (typeof s.label === "string" ? s.label : s.label.label).toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(s);
        }
      }

      return { suggestions: unique };
    },
  });
}
