import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerCompletionProvider,
  setCompletionSchema,
} from "@/components/playground/sql-completion";
import type { SchemaInfo } from "@/engine/types";

// Mock Monaco editor
function createMockMonaco() {
  const suggestions: any[] = [];
  return {
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { Enter: 3 },
    languages: {
      registerCompletionItemProvider: vi.fn(),
      CompletionItemKind: {
        Keyword: 1,
        Function: 2,
        Snippet: 3,
        Field: 4,
        Struct: 5,
        Reference: 6,
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 1,
      },
    },
    _capturedProvider: null as any,
  };
}

function createMockModel(sql: string) {
  const lines = sql.split("\n");
  return {
    getValue: () => sql,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] || "",
    getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
      const line = lines[position.lineNumber - 1] || "";
      const beforeCursor = line.substring(0, position.column - 1);
      const match = beforeCursor.match(/(\w+)$/);
      const word = match ? match[1] : "";
      return {
        word,
        startColumn: position.column - word.length,
        endColumn: position.column,
      };
    },
  };
}

const mockSchema: SchemaInfo = {
  tables: [
    {
      name: "users",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "name", type: "VARCHAR", nullable: true },
        { name: "email", type: "VARCHAR", nullable: true },
      ],
      foreignKeys: [],
      rowCount: 100,
    },
    {
      name: "orders",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "user_id", type: "INTEGER", nullable: false },
        { name: "total", type: "DECIMAL(18,2)", nullable: true },
      ],
      foreignKeys: [
        {
          fromColumns: ["user_id"],
          referencedTable: "users",
          referencedColumns: ["id"],
        },
      ],
      rowCount: 500,
    },
  ],
  relationships: [],
};

describe("SQL Completion Provider", () => {
  let monaco: ReturnType<typeof createMockMonaco>;
  let providerCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();
    monaco = createMockMonaco();
    setCompletionSchema(null);
  });

  it("registers completion provider", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
      "sql",
      expect.objectContaining({
        triggerCharacters: expect.arrayContaining([".", " "]),
      })
    );
    // Capture the provider callback
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];
  });

  it("provides SQL keyword suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SEL");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 4,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("SELECT");
    expect(labels).toContain("FROM");
    expect(labels).toContain("WHERE");
  });

  it("provides standard SQL function suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SEL COUN");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 10,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("COUNT");
    expect(labels).toContain("SUM");
    expect(labels).toContain("AVG");
  });

  it("provides DuckDB-specific function suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SEL GROUP_CONC");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 15,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("GROUP_CONCAT");
    expect(labels).toContain("APPROX_COUNT_DISTINCT");
  });

  it("provides table name suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT * FROM ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 15,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("users");
    expect(labels).toContain("orders");
  });

  it("provides column suggestions after table.", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT users.");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 14,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("id");
    expect(labels).toContain("name");
    expect(labels).toContain("email");
    // Should NOT include orders columns
    expect(labels).not.toContain("total");
  });

  it("provides CTE name suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel(
      "WITH my_cte AS (SELECT 1) SELECT * FROM my_c"
    );
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 47,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("my_cte");
  });

  it("provides OVER context suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT ROW_NUMBER() OVER ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 26,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels.some((l: string) => l.includes("PARTITION BY"))).toBe(true);
  });

  it("provides PARTITION BY context", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT ROW_NUMBER() OVER (PARTITION ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 37,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("BY");
  });

  it("provides ROWS BETWEEN context", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT SUM(x) OVER (ORDER BY id ROWS ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 39,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels.some((l: string) => l.includes("BETWEEN"))).toBe(true);
  });

  it("deduplicates suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SEL");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 4,
    });

    const labels = result.suggestions.map((s: any) =>
      typeof s.label === "string" ? s.label.toUpperCase() : s.label.label?.toUpperCase()
    );
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it("registers provider without a getter and serves the live schema via setCompletionSchema", () => {
    // Editor mounts with schema unknown — registered once, no getter
    registerCompletionProvider(monaco, undefined, "sql");
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    // No schema yet: no table suggestions
    let result = providerCallback.provideCompletionItems(
      createMockModel("SELECT * FROM "),
      { lineNumber: 1, column: 15 }
    );
    expect(result.suggestions.map((s: any) => s.label)).not.toContain("users");

    // Schema arrives (e.g. after DuckDB init / import) without re-registering
    setCompletionSchema(mockSchema);
    result = providerCallback.provideCompletionItems(
      createMockModel("SELECT * FROM "),
      { lineNumber: 1, column: 15 }
    );
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("users");
    expect(labels).toContain("orders");
  });

  it("updates table suggestions after a schema change (remount scenario)", () => {
    // Provider registered once, like the real SqlEditor does
    registerCompletionProvider(monaco, undefined, "sql");
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];
    setCompletionSchema(mockSchema);

    // A later import/refresh replaces the schema with a new table
    const afterImport: SchemaInfo = {
      tables: [
        {
          name: "products",
          columns: [
            { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
            { name: "title", type: "VARCHAR", nullable: true },
          ],
          foreignKeys: [],
          rowCount: 10,
        },
      ],
      relationships: [],
    };
    setCompletionSchema(afterImport);

    const result = providerCallback.provideCompletionItems(
      createMockModel("SELECT * FROM "),
      { lineNumber: 1, column: 15 }
    );
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("products");
    expect(labels).not.toContain("users");
    // Keywords still work
    expect(labels).toContain("SELECT");
  });

  it("handles null schema gracefully", () => {
    registerCompletionProvider(monaco, () => null);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("SELECT * FROM ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 15,
    });

    // Should still provide keywords and functions
    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("SELECT");
  });

  it("provides snippet suggestions", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("WITH ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 5,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels.some((l: string) => l.includes("AS (...)"))).toBe(true);
  });

  it("provides DuckDB QUALIFY snippet", () => {
    registerCompletionProvider(monaco, () => mockSchema);
    providerCallback =
      monaco.languages.registerCompletionItemProvider.mock.calls[0][1];

    const model = createMockModel("QUALIFY ");
    const result = providerCallback.provideCompletionItems(model, {
      lineNumber: 1,
      column: 8,
    });

    const labels = result.suggestions.map((s: any) => s.label);
    expect(labels).toContain("QUALIFY");
  });
});
