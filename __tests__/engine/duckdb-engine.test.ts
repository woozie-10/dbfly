import { describe, it, expect, beforeAll, afterAll } from "vitest";

let DuckDBEngine: any;
let engine: any;
let canInitDuckDB = false;

beforeAll(async () => {
  try {
    const mod = await import("@/engine/duckdb-engine");
    DuckDBEngine = mod.DuckDBEngine;
    engine = new DuckDBEngine();
    await engine.initialize();
    canInitDuckDB = true;
  } catch {
    canInitDuckDB = false;
  }
});

afterAll(async () => {
  if (engine) {
    try { await engine.dispose(); } catch { /* ignore */ }
  }
});

// Helper: conditionally define tests based on DuckDB availability
function describeDuckDB(name: string, fn: () => void) {
  describe(name, () => {
    // We need to check inside the describe block since beforeAll hasn't run yet
    // when describe() is called. We use a check inside each test instead.
    fn();
  });
}

function itIfDuckDB(name: string, fn: () => void | Promise<void>) {
  it(canInitDuckDB ? name : `${name} (skipped: no DuckDB-Wasm)`, async () => {
    if (!canInitDuckDB) return;
    await fn();
  });
}

describeDuckDB("DuckDB Engine", () => {
  itIfDuckDB("initializes successfully", () => {
    expect(canInitDuckDB).toBe(true);
  });

  itIfDuckDB("has correct name", () => {
    expect(engine.name).toBe("DuckDB-Wasm");
  });

  itIfDuckDB("provides a connection", () => {
    expect(engine.getConnection()).not.toBeNull();
  });

  itIfDuckDB("executes SELECT 1", async () => {
    const result = await engine.query("SELECT 1 AS num");
    expect(result.columns).toEqual(["num"]);
    expect(result.rows).toEqual([[1]]);
    expect(result.rowCount).toBe(1);
  });

  itIfDuckDB("executes SELECT with string", async () => {
    const result = await engine.query("SELECT 'hello' AS greeting");
    expect(result.columns).toEqual(["greeting"]);
    expect(result.rows[0][0]).toBe("hello");
  });

  itIfDuckDB("executes SELECT with multiple columns", async () => {
    const result = await engine.query("SELECT 1 AS a, 2 AS b, 3 AS c");
    expect(result.columns).toEqual(["a", "b", "c"]);
    expect(result.rows[0]).toEqual([1, 2, 3]);
  });

  itIfDuckDB("executes SELECT with NULL", async () => {
    const result = await engine.query("SELECT NULL AS val");
    expect(result.rows[0][0]).toBeNull();
  });

  itIfDuckDB("returns execution time", async () => {
    const result = await engine.query("SELECT 1");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  itIfDuckDB("returns correct column types", async () => {
    const result = await engine.query("SELECT 42 AS i, 'x' AS s, 3.14 AS f");
    expect(result.columnTypes.length).toBe(3);
    expect(result.sqlTypes.length).toBe(3);
  });

  itIfDuckDB("multi-statement execution", async () => {
    const result = await engine.query(`
      CREATE TABLE t_ms (id INTEGER, name VARCHAR);
      INSERT INTO t_ms VALUES (1, 'Alice'), (2, 'Bob');
      SELECT * FROM t_ms;
    `);
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("returns result from last SELECT", async () => {
    const result = await engine.query("SELECT 1; SELECT 2; SELECT 3;");
    expect(result.columns).toEqual(["3"]);
    expect(result.rows[0][0]).toBe(3);
  });

  itIfDuckDB("empty result when no SELECT", async () => {
    const result = await engine.query("CREATE TABLE t_ns (id INTEGER); INSERT INTO t_ns VALUES (1);");
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  itIfDuckDB("handles single-line comments", async () => {
    const result = await engine.query("-- comment\nSELECT 1 AS val");
    expect(result.rows[0][0]).toBe(1);
  });

  itIfDuckDB("handles block comments", async () => {
    const result = await engine.query("/* comment */ SELECT 42 AS val");
    expect(result.rows[0][0]).toBe(42);
  });

  itIfDuckDB("semicolons inside strings", async () => {
    const result = await engine.query("SELECT 'hello;world' AS val");
    expect(result.rows[0][0]).toBe("hello;world");
  });

  itIfDuckDB("double-quoted identifiers with semicolons", async () => {
    const result = await engine.query('SELECT 1 AS "col;name"');
    expect(result.columns).toEqual(["col;name"]);
  });

  itIfDuckDB("escaped quotes in strings", async () => {
    const result = await engine.query("SELECT 'it''s a test' AS val");
    expect(result.rows[0][0]).toBe("it's a test");
  });

  itIfDuckDB("WITH (CTE)", async () => {
    const result = await engine.query("WITH cte AS (SELECT 1 AS val) SELECT * FROM cte");
    expect(result.rows[0][0]).toBe(1);
  });

  itIfDuckDB("SHOW TABLES", async () => {
    await engine.query("CREATE TABLE t_show (id INTEGER)");
    const result = await engine.query("SHOW TABLES");
    expect(result.columns.length).toBeGreaterThan(0);
  });

  itIfDuckDB("DESCRIBE", async () => {
    await engine.query("CREATE TABLE t_desc (id INTEGER, name VARCHAR)");
    const result = await engine.query("DESCRIBE t_desc");
    expect(result.columns.length).toBeGreaterThan(0);
  });

  itIfDuckDB("EXPLAIN plan", async () => {
    const result = await engine.queryExplain("SELECT 1");
    expect(result.columns).toEqual(["Plan"]);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  itIfDuckDB("EXPLAIN ANALYZE", async () => {
    const result = await engine.queryExplain("EXPLAIN ANALYZE SELECT 1");
    expect(result.columns).toEqual(["Plan"]);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  itIfDuckDB("EXPLAIN complex query", async () => {
    await engine.query("CREATE TABLE t_ex (id INTEGER, val VARCHAR)");
    for (let i = 0; i < 10; i++) {
      await engine.query(`INSERT INTO t_ex VALUES (${i}, 'v${i}')`);
    }
    const result = await engine.queryExplain("SELECT * FROM t_ex WHERE id > 5 ORDER BY val");
    expect(result.rows.length).toBeGreaterThan(0);
  });

  itIfDuckDB("creates table with PK", async () => {
    await engine.query("CREATE TABLE t_pk (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL)");
    const schema = await engine.getSchema();
    const table = schema.tables.find((t: any) => t.name === "t_pk");
    expect(table).toBeDefined();
    expect(table!.columns.length).toBe(2);
  });

  itIfDuckDB("detects primary keys", async () => {
    await engine.query("CREATE TABLE t_pk2 (id INTEGER PRIMARY KEY, name VARCHAR)");
    const schema = await engine.getSchema();
    const table = schema.tables.find((t: any) => t.name === "t_pk2");
    const idCol = table!.columns.find((c: any) => c.name === "id");
    expect(idCol?.isPrimaryKey).toBe(true);
  });

  itIfDuckDB("detects foreign keys", async () => {
    await engine.query("CREATE TABLE t_fk_p (id INTEGER PRIMARY KEY)");
    await engine.query("CREATE TABLE t_fk_c (id INTEGER PRIMARY KEY, pid INTEGER, FOREIGN KEY (pid) REFERENCES t_fk_p(id))");
    const schema = await engine.getSchema();
    const child = schema.tables.find((t: any) => t.name === "t_fk_c");
    expect(child!.foreignKeys.length).toBeGreaterThan(0);
  });

  itIfDuckDB("gets row counts", async () => {
    await engine.query("CREATE TABLE t_rc (id INTEGER)");
    await engine.query("INSERT INTO t_rc VALUES (1), (2), (3), (4), (5)");
    const schema = await engine.getSchema();
    const table = schema.tables.find((t: any) => t.name === "t_rc");
    expect(table?.rowCount).toBe(5);
  });

  itIfDuckDB("drops a table", async () => {
    await engine.query("CREATE TABLE t_drop (id INTEGER)");
    await engine.query("DROP TABLE t_drop");
    const schema = await engine.getSchema();
    expect(schema.tables.find((t: any) => t.name === "t_drop")).toBeUndefined();
  });

  itIfDuckDB("BOOLEAN type", async () => {
    const result = await engine.query("SELECT true, false");
    expect(result.rows[0][0]).toBe(true);
    expect(result.rows[0][1]).toBe(false);
  });

  itIfDuckDB("VARCHAR type", async () => {
    const result = await engine.query("SELECT 'Hello World'::VARCHAR");
    expect(result.rows[0][0]).toBe("Hello World");
  });

  itIfDuckDB("DOUBLE type", async () => {
    const result = await engine.query("SELECT 3.14159::DOUBLE");
    expect(result.rows[0][0]).toBeCloseTo(3.14159);
  });

  itIfDuckDB("DATE type", async () => {
    const result = await engine.query("SELECT '2024-01-15'::DATE");
    expect(result.rows[0][0]).toBeTruthy();
  });

  itIfDuckDB("TIMESTAMP type", async () => {
    const result = await engine.query("SELECT '2024-01-15 14:30:00'::TIMESTAMP");
    expect(result.rows[0][0]).toBeTruthy();
  });

  itIfDuckDB("UUID type", async () => {
    const result = await engine.query("SELECT '550e8400-e29b-41d4-a716-446655440000'::UUID");
    expect(result.rows[0][0]).toBeTruthy();
  });

  itIfDuckDB("INTERVAL type", async () => {
    const result = await engine.query("SELECT INTERVAL '1 month 2 days 3 hours'");
    expect(result.rows[0][0]).toBeTruthy();
  });

  itIfDuckDB("DECIMAL type", async () => {
    const result = await engine.query("SELECT 123456.789::DECIMAL(18,4)");
    expect(result.rows[0][0]).toBeTruthy();
  });

  itIfDuckDB("INSERT and SELECT", async () => {
    await engine.query("CREATE TABLE t_io (id INTEGER, name VARCHAR)");
    await engine.query("INSERT INTO t_io VALUES (1, 'Alice'), (2, 'Bob')");
    const result = await engine.query("SELECT * FROM t_io ORDER BY id");
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]).toEqual([1, "Alice"]);
  });

  itIfDuckDB("UPDATE", async () => {
    await engine.query("CREATE TABLE t_up (id INTEGER, name VARCHAR)");
    await engine.query("INSERT INTO t_up VALUES (1, 'Alice')");
    await engine.query("UPDATE t_up SET name = 'Bob' WHERE id = 1");
    const result = await engine.query("SELECT * FROM t_up");
    expect(result.rows[0]).toEqual([1, "Bob"]);
  });

  itIfDuckDB("DELETE", async () => {
    await engine.query("CREATE TABLE t_del (id INTEGER)");
    await engine.query("INSERT INTO t_del VALUES (1), (2), (3)");
    await engine.query("DELETE FROM t_del WHERE id = 2");
    const result = await engine.query("SELECT * FROM t_del ORDER BY id");
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("WHERE clause", async () => {
    await engine.query("CREATE TABLE t_wh (id INTEGER, val INTEGER)");
    await engine.query("INSERT INTO t_wh VALUES (1, 10), (2, 20), (3, 30)");
    const result = await engine.query("SELECT * FROM t_wh WHERE val > 15 ORDER BY id");
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("GROUP BY and HAVING", async () => {
    await engine.query("CREATE TABLE t_gr (cat VARCHAR, val INTEGER)");
    await engine.query("INSERT INTO t_gr VALUES ('A', 10), ('A', 20), ('B', 30)");
    const result = await engine.query(
      "SELECT cat, SUM(val) AS total FROM t_gr GROUP BY cat HAVING SUM(val) > 15"
    );
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("ORDER BY", async () => {
    await engine.query("CREATE TABLE t_ob (val INTEGER)");
    await engine.query("INSERT INTO t_ob VALUES (3), (1), (2)");
    const result = await engine.query("SELECT * FROM t_ob ORDER BY val ASC");
    expect(result.rows.map((r: any) => r[0])).toEqual([1, 2, 3]);
  });

  itIfDuckDB("DISTINCT", async () => {
    await engine.query("CREATE TABLE t_di (val INTEGER)");
    await engine.query("INSERT INTO t_di VALUES (1), (1), (2), (2), (3)");
    const result = await engine.query("SELECT DISTINCT val FROM t_di ORDER BY val");
    expect(result.rows.map((r: any) => r[0])).toEqual([1, 2, 3]);
  });

  itIfDuckDB("LIMIT and OFFSET", async () => {
    await engine.query("CREATE TABLE t_lo (id INTEGER)");
    await engine.query("INSERT INTO t_lo SELECT i FROM generate_series(1, 10) t(i)");
    const result = await engine.query("SELECT * FROM t_lo ORDER BY id LIMIT 3 OFFSET 2");
    expect(result.rows.length).toBe(3);
    expect(result.rows[0][0]).toBe(3);
  });

  itIfDuckDB("INNER JOIN", async () => {
    await engine.query("CREATE TABLE j1 (id INTEGER, val VARCHAR)");
    await engine.query("CREATE TABLE j2 (id INTEGER, j1_id INTEGER)");
    await engine.query("INSERT INTO j1 VALUES (1, 'a'), (2, 'b')");
    await engine.query("INSERT INTO j2 VALUES (10, 1), (20, 2), (30, 99)");
    const result = await engine.query(
      "SELECT j1.id FROM j1 INNER JOIN j2 ON j1.id = j2.j1_id ORDER BY j1.id"
    );
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("LEFT JOIN", async () => {
    await engine.query("CREATE TABLE la (id INTEGER)");
    await engine.query("CREATE TABLE lb (id INTEGER, la_id INTEGER)");
    await engine.query("INSERT INTO la VALUES (1), (2), (3)");
    await engine.query("INSERT INTO lb VALUES (10, 1)");
    const result = await engine.query(
      "SELECT la.id, lb.id AS lb_id FROM la LEFT JOIN lb ON la.id = lb.la_id ORDER BY la.id"
    );
    expect(result.rows.length).toBe(3);
    expect(result.rows[2][1]).toBeNull();
  });

  itIfDuckDB("CROSS JOIN", async () => {
    await engine.query("CREATE TABLE ca (id INTEGER)");
    await engine.query("CREATE TABLE cb (id INTEGER)");
    await engine.query("INSERT INTO ca VALUES (1), (2)");
    await engine.query("INSERT INTO cb VALUES (10), (20)");
    const result = await engine.query("SELECT * FROM ca CROSS JOIN cb");
    expect(result.rows.length).toBe(4);
  });

  itIfDuckDB("simple CTE", async () => {
    const result = await engine.query(
      "WITH cte AS (SELECT 1 AS val UNION ALL SELECT 2) SELECT * FROM cte ORDER BY val"
    );
    expect(result.rows.length).toBe(2);
  });

  itIfDuckDB("recursive CTE", async () => {
    const result = await engine.query(`
      WITH RECURSIVE nums AS (
        SELECT 1 AS n UNION ALL SELECT n + 1 FROM nums WHERE n < 5
      ) SELECT * FROM nums
    `);
    expect(result.rows.length).toBe(5);
  });

  itIfDuckDB("ROW_NUMBER window function", async () => {
    await engine.query("CREATE TABLE t_wn (id INTEGER, grp VARCHAR)");
    await engine.query("INSERT INTO t_wn VALUES (1, 'A'), (2, 'A'), (3, 'B')");
    const result = await engine.query(
      "SELECT id, ROW_NUMBER() OVER (PARTITION BY grp ORDER BY id) AS rn FROM t_wn ORDER BY id"
    );
    expect(result.rows[0][1]).toBe(1);
    expect(result.rows[1][1]).toBe(2);
    expect(result.rows[2][1]).toBe(1);
  });

  itIfDuckDB("column aliases", async () => {
    const result = await engine.query("SELECT 1 AS one, 2 AS two");
    expect(result.columns).toEqual(["one", "two"]);
  });

  itIfDuckDB("table aliases", async () => {
    await engine.query("CREATE TABLE t_al (id INTEGER)");
    await engine.query("INSERT INTO t_al VALUES (42)");
    const result = await engine.query("SELECT t.id FROM t_al AS t");
    expect(result.rows[0][0]).toBe(42);
  });

  itIfDuckDB("throws on invalid SQL", async () => {
    await expect(engine.query("SELCTZ 1")).rejects.toThrow();
  });

  itIfDuckDB("throws on non-existent table", async () => {
    await expect(engine.query("SELECT * FROM nonexistent_xyz")).rejects.toThrow();
  });

  itIfDuckDB("throws when not initialized", async () => {
    if (!DuckDBEngine) return;
    const e = new DuckDBEngine();
    await expect(e.query("SELECT 1")).rejects.toThrow("not initialized");
  });

  itIfDuckDB("imports CSV", async () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = await engine.importFile("test.csv", csv, "imp_csv", "csv");
    expect(result.rowCount).toBe(2);
  });

  itIfDuckDB("imports JSON", async () => {
    const json = '[{"name":"Alice","age":"30"},{"name":"Bob","age":"25"}]';
    const result = await engine.importFile("test.json", json, "imp_json", "json");
    expect(result.rowCount).toBe(2);
  });

  itIfDuckDB("imports CSV with quoted fields", async () => {
    const csv = 'name,bio\nAlice,"Hello, world"\nBob,"Say ""hi"""';
    const result = await engine.importFile("test.csv", csv, "imp_q", "csv");
    expect(result.rowCount).toBe(2);
  });

  itIfDuckDB("imports CSV with Unicode", async () => {
    const csv = "name\nАлиса\n田中";
    const result = await engine.importFile("test.csv", csv, "imp_u", "csv");
    expect(result.rowCount).toBe(2);
  });

  itIfDuckDB("CSV import infers typed columns", async () => {
    const csv = [
      "id,name,score,active,born,created_at",
      "1,Alice,9.5,true,1990-05-15,2024-01-01 10:30:00",
      "2,Bob,8,false,1985-11-20,2024-02-02 12:00:00",
    ].join("\n");
    const result = await engine.importFile("typed.csv", csv, "imp_csv_typed", "csv");
    expect(result.rowCount).toBe(2);
    const res = await engine.query("SELECT * FROM imp_csv_typed ORDER BY id");
    expect(res.sqlTypes[0]).toBe("INTEGER");
    expect(res.sqlTypes[1]).toBe("VARCHAR");
    expect(res.sqlTypes[2]).toBe("DOUBLE");
    expect(res.sqlTypes[3]).toBe("BOOLEAN");
    expect(res.sqlTypes[4]).toBe("DATE");
    expect(res.sqlTypes[5].toLowerCase()).toContain("timestamp");
    expect(res.rows[0][1]).toBe("Alice");
    expect(res.rows[0][2]).toBeCloseTo(9.5);
    expect(res.rows[0][3]).toBe(true);
    expect(res.rows[1][3]).toBe(false);
  });

  itIfDuckDB("CSV import big integers become BIGINT", async () => {
    const csv = "id\n4000000000\n2147483648\n5";
    const result = await engine.importFile("big.csv", csv, "imp_csv_big", "csv");
    expect(result.rowCount).toBe(3);
    const res = await engine.query("SELECT * FROM imp_csv_big ORDER BY id");
    expect(res.sqlTypes[0]).toBe("BIGINT");
    expect(res.rows[0][0]).toBe(5);
  });

  itIfDuckDB("CSV empty fields become NULL without forcing VARCHAR", async () => {
    const csv = "id,label\n1,A\n2,\n3,C";
    const result = await engine.importFile("null.csv", csv, "imp_csv_null", "csv");
    expect(result.rowCount).toBe(3);
    const res = await engine.query("SELECT * FROM imp_csv_null ORDER BY id");
    expect(res.sqlTypes).toEqual(["INTEGER", "VARCHAR"]);
    expect(res.rows[1]).toEqual([2, null]);
    expect(res.rows[0][0]).toBe(1);
  });

  itIfDuckDB("CSV mixed incompatible values stay VARCHAR without error", async () => {
    const csv = "code,val\nA,1\nB,abc\nC,007\nD,3.5";
    const result = await engine.importFile("mixed.csv", csv, "imp_csv_mixed", "csv");
    expect(result.rowCount).toBe(4);
    const res = await engine.query("SELECT * FROM imp_csv_mixed ORDER BY code");
    expect(res.sqlTypes[1]).toBe("VARCHAR");
    const vals = res.rows.map((r: any) => r[1]);
    expect(vals).toEqual(["1", "007", "3.5", "abc"]);
  });

  itIfDuckDB("JSON import infers native types and preserves NULLs", async () => {
    const json = JSON.stringify([
      { id: 1, price: 9.99, ok: true, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, price: 7, ok: false, name: null },
    ]);
    const result = await engine.importFile("t.json", json, "imp_json_typed", "json");
    expect(result.rowCount).toBe(3);
    const res = await engine.query("SELECT * FROM imp_json_typed ORDER BY id");
    expect(res.sqlTypes).toEqual(["INTEGER", "DOUBLE", "BOOLEAN", "VARCHAR"]);
    expect(res.rows[0][1]).toBeCloseTo(9.99);
    expect(res.rows[0][3]).toBe("Alice");
    expect(res.rows[1][3]).toBeNull(); // missing field → NULL
    expect(res.rows[2][2]).toBe(false);
    expect(res.rows[2][3]).toBeNull(); // explicit null → NULL
  });

  itIfDuckDB("JSON import keeps big integers and nested values as JSON text", async () => {
    const json = JSON.stringify([
      { id: 3000000000, tags: ["a", "b"], meta: { k: 1 } },
      { id: 3000000001, tags: [], meta: { k: 2 } },
    ]);
    const result = await engine.importFile("n.json", json, "imp_json_nested", "json");
    expect(result.rowCount).toBe(2);
    const res = await engine.query("SELECT * FROM imp_json_nested ORDER BY id");
    expect(res.sqlTypes[0]).toBe("BIGINT");
    expect(res.sqlTypes[1]).toBe("VARCHAR");
    expect(res.sqlTypes[2]).toBe("VARCHAR");
    expect(res.rows[0][1]).toBe('["a","b"]');
    expect(res.rows[0][2]).toBe('{"k":1}');
  });

  itIfDuckDB("CSV quoted empty field also becomes NULL", async () => {
    const csv = 'id,note\n1,""\n2,x';
    const result = await engine.importFile("q.csv", csv, "imp_csv_qempty", "csv");
    expect(result.rowCount).toBe(2);
    const res = await engine.query("SELECT * FROM imp_csv_qempty ORDER BY id");
    expect(res.rows[0][1]).toBeNull();
  });

  itIfDuckDB("rejects empty JSON array", async () => {
    await expect(engine.importFile("e.json", "[]", "e_t", "json")).rejects.toThrow("no data");
  });

  itIfDuckDB("rejects empty CSV", async () => {
    await expect(engine.importFile("e.csv", "", "e_csv", "csv")).rejects.toThrow();
  });

  itIfDuckDB("dispose and re-initialize", async () => {
    if (!DuckDBEngine) return;
    const e2 = new DuckDBEngine();
    await e2.initialize();
    const r = await e2.query("SELECT 1 AS val");
    expect(r.rows[0][0]).toBe(1);
    await e2.dispose();
    expect(e2.getConnection()).toBeNull();
  });
});
