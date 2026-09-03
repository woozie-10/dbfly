import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseJson,
  resultToCsv,
  resultToJson,
  downloadFile,
} from "@/components/playground/file-io";
import type { QueryResult } from "@/engine/types";

// Helper to create a QueryResult
function makeResult(
  columns: string[],
  rows: QueryResult["rows"],
  overrides: Partial<QueryResult> = {}
): QueryResult {
  return {
    columns,
    columnTypes: columns.map(() => "string" as any),
    sqlTypes: columns.map(() => "VARCHAR"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// parseCsv
// ═══════════════════════════════════════════════════════════════════
describe("parseCsv", () => {
  it("parses simple CSV", () => {
    const result = parseCsv("name,age\nAlice,30\nBob,25");
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toEqual([["Alice", "30"], ["Bob", "25"]]);
  });

  it("parses empty CSV", () => {
    const result = parseCsv("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("parses CSV with only headers", () => {
    const result = parseCsv("name,age\n");
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toEqual([]);
  });

  it("handles quoted fields", () => {
    const result = parseCsv('name,bio\nAlice,"Hello, world"\nBob,"Say ""hi"""');
    expect(result.rows[0][1]).toBe("Hello, world");
    expect(result.rows[1][1]).toBe('Say "hi"');
  });

  it("handles quoted fields with newlines", () => {
    const result = parseCsv('name,bio\nAlice,"line1\nline2"');
    expect(result.rows[0][1]).toBe("line1\nline2");
  });

  it("handles empty fields (NULL)", () => {
    const result = parseCsv("name,age\nAlice,\n,25");
    expect(result.rows[0]).toEqual(["Alice", ""]);
    expect(result.rows[1]).toEqual(["", "25"]);
  });

  it("handles unicode content", () => {
    const result = parseCsv("name,city\nАлиса,Москва\n田中,東京");
    expect(result.rows[0]).toEqual(["Алиса", "Москва"]);
    expect(result.rows[1]).toEqual(["田中", "東京"]);
  });

  it("handles \\r\\n line endings", () => {
    const result = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(result.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("handles single column", () => {
    const result = parseCsv("value\n1\n2\n3");
    expect(result.headers).toEqual(["value"]);
    expect(result.rows.length).toBe(3);
  });

  it("handles commas inside quotes", () => {
    const csv = 'col\n"a,b,c"';
    const result = parseCsv(csv);
    expect(result.rows[0][0]).toBe("a,b,c");
  });

  it("handles mixed content types", () => {
    const csv = 'id,name,value\n1,"test",3.14\n2,"hello, world",42';
    const result = parseCsv(csv);
    expect(result.rows.length).toBe(2);
    expect(result.rows[1][1]).toBe("hello, world");
    expect(result.rows[0]).toEqual(["1", "test", "3.14"]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// parseJson
// ═══════════════════════════════════════════════════════════════════
describe("parseJson", () => {
  it("parses JSON array of objects", () => {
    const result = parseJson('[{"name":"Alice","age":30},{"name":"Bob","age":25}]');
    expect(result.headers).toContain("name");
    expect(result.headers).toContain("age");
    expect(result.rows.length).toBe(2);
  });

  it("parses single JSON object", () => {
    const result = parseJson('{"name":"Alice","age":30}');
    expect(result.headers).toContain("name");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toContain("Alice");
  });

  it("handles empty array", () => {
    const result = parseJson("[]");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("handles missing fields (NULL)", () => {
    const result = parseJson('[{"a":1},{"a":2,"b":3}]');
    expect(result.rows.length).toBe(2);
    // First object should have null for missing "b"
    expect(result.rows[0]).toContain(null);
  });

  it("handles unicode content", () => {
    const result = parseJson('[{"name":"Алиса"},{"name":"田中"}]');
    expect(result.rows[0]).toContain("Алиса");
    expect(result.rows[1]).toContain("田中");
  });

  it("handles nested objects (stringified)", () => {
    const result = parseJson('[{"data":{"x":1}}]');
    // Nested objects should be JSON-stringified
    const dataIdx = result.headers.indexOf("data");
    expect(typeof result.rows[0][dataIdx]).toBe("string");
  });

  it("handles null values", () => {
    const result = parseJson('[{"a":null}]');
    expect(result.rows[0]).toContain(null);
  });

  it("handles numeric values", () => {
    const result = parseJson('[{"count":42}]');
    expect(result.rows[0]).toContain("42");
  });

  it("handles boolean values", () => {
    const result = parseJson('[{"active":true}]');
    expect(result.rows[0]).toContain("true");
  });
});

// ═══════════════════════════════════════════════════════════════════
// resultToCsv
// ═══════════════════════════════════════════════════════════════════
describe("resultToCsv", () => {
  it("converts result to CSV", () => {
    const result = makeResult(["name", "age"], [["Alice", 30], ["Bob", 25]]);
    const csv = resultToCsv(result);
    expect(csv).toContain("name,age");
    expect(csv).toContain("Alice,30");
    expect(csv).toContain("Bob,25");
  });

  it("handles NULL values", () => {
    const result = makeResult(["name"], [[null], ["Alice"]]);
    const csv = resultToCsv(result);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("Alice");
  });

  it("handles empty result", () => {
    const result = makeResult(["col"], []);
    const csv = resultToCsv(result);
    expect(csv).toBe("col");
  });

  it("escapes fields with commas", () => {
    const result = makeResult(["val"], [["hello, world"]]);
    const csv = resultToCsv(result);
    expect(csv).toContain('"hello, world"');
  });

  it("escapes fields with quotes", () => {
    const result = makeResult(["val"], [['say "hi"']]);
    const csv = resultToCsv(result);
    expect(csv).toContain('"say ""hi"""');
  });

  it("escapes fields with newlines", () => {
    const result = makeResult(["val"], [["line1\nline2"]]);
    const csv = resultToCsv(result);
    expect(csv).toContain('"line1\nline2"');
  });

  it("handles unicode content", () => {
    const result = makeResult(["name"], [["Привет"]]);
    const csv = resultToCsv(result);
    expect(csv).toContain("Привет");
  });

  it("handles object values", () => {
    const result = makeResult(["data"], [[{ a: 1 }]]);
    const csv = resultToCsv(result);
    // Objects are JSON.stringified and CSV-escaped (quotes doubled)
    expect(csv).toContain('""a"":1');
  });
});

// ═══════════════════════════════════════════════════════════════════
// resultToJson
// ═══════════════════════════════════════════════════════════════════
describe("resultToJson", () => {
  it("converts result to JSON array", () => {
    const result = makeResult(["name", "age"], [["Alice", 30], ["Bob", 25]]);
    const json = resultToJson(result);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: "Alice", age: 30 });
  });

  it("handles NULL values", () => {
    const result = makeResult(["name"], [[null]]);
    const json = resultToJson(result);
    const parsed = JSON.parse(json);
    expect(parsed[0].name).toBeNull();
  });

  it("handles empty result", () => {
    const result = makeResult(["col"], []);
    const json = resultToJson(result);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual([]);
  });

  it("handles duplicate column names", () => {
    const result = makeResult(["id", "id"], [[1, 2]]);
    const json = resultToJson(result);
    const parsed = JSON.parse(json);
    // Second "id" column will overwrite first in object
    expect(parsed[0]).toHaveProperty("id");
  });

  it("produces formatted JSON (pretty print)", () => {
    const result = makeResult(["a"], [[1]]);
    const json = resultToJson(result);
    expect(json).toContain("\n");
  });

  it("handles unicode", () => {
    const result = makeResult(["name"], [["Привет"]]);
    const json = resultToJson(result);
    const parsed = JSON.parse(json);
    expect(parsed[0].name).toBe("Привет");
  });
});

// ═══════════════════════════════════════════════════════════════════
// downloadFile
// ═══════════════════════════════════════════════════════════════════
describe("downloadFile", () => {
  it("does not throw", () => {
    // downloadFile creates a temporary <a> element and clicks it
    // In jsdom this won't actually download but shouldn't throw
    expect(() => {
      downloadFile("test content", "test.txt", "text/plain");
    }).not.toThrow();
  });
});
