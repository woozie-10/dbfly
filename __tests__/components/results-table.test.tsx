import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsTable } from "@/components/playground/results-table";
import type { QueryResult, ColumnType } from "@/engine/types";

function makeResult(
  columns: string[],
  rows: QueryResult["rows"],
  columnTypes: ColumnType[] = [],
  sqlTypes: string[] = []
): QueryResult {
  return {
    columns,
    columnTypes: columnTypes.length ? columnTypes : columns.map(() => "string" as ColumnType),
    sqlTypes: sqlTypes.length ? sqlTypes : columns.map(() => "VARCHAR"),
    rows,
    rowCount: rows.length,
    executionTimeMs: 12.5,
  };
}

describe("ResultsTable", () => {
  // ── Empty / Loading / Error states ────────────────────────────
  describe("empty states", () => {
    it("shows loading indicator when isRunning", () => {
      render(<ResultsTable result={null} error={null} isRunning={true} />);
      expect(screen.getByText("Executing query...")).toBeInTheDocument();
    });

    it("shows empty state when no result", () => {
      render(<ResultsTable result={null} error={null} isRunning={false} />);
      expect(screen.getByText("Run a query to see results")).toBeInTheDocument();
    });

    it("shows error state", () => {
      render(<ResultsTable result={null} error="Syntax error" isRunning={false} />);
      expect(screen.getByText("Query Error")).toBeInTheDocument();
      expect(screen.getByText("Syntax error")).toBeInTheDocument();
    });

    it("shows success with no columns", () => {
      const result = makeResult([], []);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("Query executed successfully")).toBeInTheDocument();
    });
  });

  // ── Result rendering ──────────────────────────────────────────
  describe("result rendering", () => {
    it("renders column headers", () => {
      const result = makeResult(["name", "age"], [["Alice", 30]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("name")).toBeInTheDocument();
      expect(screen.getByText("age")).toBeInTheDocument();
    });

    it("renders cell values", () => {
      const result = makeResult(["name", "age"], [["Alice", 30]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("displays row count", () => {
      const result = makeResult(["id"], [[1], [2], [3]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("3 rows")).toBeInTheDocument();
    });

    it("displays execution time", () => {
      const result = makeResult(["id"], [[1]]);
      result.executionTimeMs = 42.7;
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("42.7ms")).toBeInTheDocument();
    });

    it("displays SQL type in column headers", () => {
      const result = makeResult(["col"], [[1]], ["integer"], ["INTEGER"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("INTEGER")).toBeInTheDocument();
    });
  });

  // ── NULL rendering ────────────────────────────────────────────
  describe("NULL rendering", () => {
    it("renders NULL values", () => {
      const result = makeResult(["val"], [[null]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("NULL")).toBeInTheDocument();
    });
  });

  // ── Boolean rendering ────────────────────────────────────────
  describe("boolean rendering", () => {
    it("renders TRUE and FALSE", () => {
      const result = makeResult(["flag"], [[true], [false]], ["boolean"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("TRUE")).toBeInTheDocument();
      expect(screen.getByText("FALSE")).toBeInTheDocument();
    });
  });

  // ── Numeric rendering ────────────────────────────────────────
  describe("numeric rendering", () => {
    it("renders integers with locale formatting", () => {
      const result = makeResult(["count"], [[1000000]], ["integer"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      // Should use locale formatting
      expect(screen.getByText((1000000).toLocaleString())).toBeInTheDocument();
    });

    it("renders floats without rounding", () => {
      const result = makeResult(["val"], [[3.141592653589793]], ["float"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("3.141592653589793")).toBeInTheDocument();
    });
  });

  // ── JSON/STRUCT rendering ────────────────────────────────────
  describe("JSON/STRUCT rendering", () => {
    it("renders JSON objects as stringified", () => {
      const result = makeResult(["data"], [[{ a: 1, b: 2 }]], ["json"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText('{"a":1,"b":2}')).toBeInTheDocument();
    });

    it("renders non-JSON objects as stringified", () => {
      const result = makeResult(["data"], [[{ key: "value" }]], ["string"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText('{"key":"value"}')).toBeInTheDocument();
    });
  });

  // ── String rendering ──────────────────────────────────────────
  describe("string rendering", () => {
    it("renders timestamps in monospace", () => {
      const result = makeResult(["ts"], [["2024-01-15 14:30:45"]], ["timestamp"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("2024-01-15 14:30:45")).toBeInTheDocument();
    });

    it("renders intervals in amber color", () => {
      const result = makeResult(["interval"], [["1 month 2 days"]], ["interval"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("1 month 2 days")).toBeInTheDocument();
    });

    it("renders UUIDs", () => {
      const result = makeResult(["uuid"], [["550e8400-e29b-41d4-a716-446655440000"]], ["uuid"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("550e8400-e29b-41d4-a716-446655440000")).toBeInTheDocument();
    });

    it("renders BLOB hex dump", () => {
      const result = makeResult(["blob"], [["BLOB (3 bytes)\n48 65 6c"]], ["binary"]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("BLOB (3 bytes)")).toBeInTheDocument();
    });
  });

  // ── Sorting ──────────────────────────────────────────────────
  describe("sorting", () => {
    it("sorts ascending on first click", async () => {
      const user = userEvent.setup();
      const result = makeResult(["val"], [[30], [10], [20]]);
      const { container } = render(<ResultsTable result={result} error={null} isRunning={false} />);

      // Click the sort div inside the column header
      const sortDiv = container.querySelector("th .cursor-pointer")!;
      await user.click(sortDiv);

      const cells = screen.getAllByRole("cell");
      // First data cell should be 10 after ascending sort
      expect(cells[0]).toHaveTextContent("10");
    });

    it("sorts descending on second click", async () => {
      const user = userEvent.setup();
      const result = makeResult(["val"], [[30], [10], [20]]);
      const { container } = render(<ResultsTable result={result} error={null} isRunning={false} />);

      const sortDiv = container.querySelector("th .cursor-pointer")!;
      await user.click(sortDiv);
      await user.click(sortDiv);

      const cells = screen.getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("30");
    });

    it("clears sort on third click", async () => {
      const user = userEvent.setup();
      const result = makeResult(["val"], [[30], [10], [20]]);
      const { container } = render(<ResultsTable result={result} error={null} isRunning={false} />);

      const sortDiv = container.querySelector("th .cursor-pointer")!;
      await user.click(sortDiv);
      await user.click(sortDiv);
      await user.click(sortDiv);

      const cells = screen.getAllByRole("cell");
      // Should be back to original order
      expect(cells[0]).toHaveTextContent("30");
    });

    it("sorts numbers correctly (not lexicographically)", async () => {
      const user = userEvent.setup();
      const result = makeResult(["val"], [[200], [1000], [30]]);
      const { container } = render(<ResultsTable result={result} error={null} isRunning={false} />);

      const sortDiv = container.querySelector("th .cursor-pointer")!;
      await user.click(sortDiv);

      const cells = screen.getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("30");
      expect(cells[1]).toHaveTextContent("200");
      expect(cells[2]).toHaveTextContent("1,000");
    });

    it("sorts NULL values to end", async () => {
      const user = userEvent.setup();
      const result = makeResult(["val"], [[10], [null], [5]]);
      const { container } = render(<ResultsTable result={result} error={null} isRunning={false} />);

      const sortDiv = container.querySelector("th .cursor-pointer")!;
      await user.click(sortDiv);

      const cells = screen.getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("5");
      expect(cells[1]).toHaveTextContent("10");
      expect(cells[2].textContent).toContain("NULL");
    });
  });

  // ── Pagination ───────────────────────────────────────────────
  describe("pagination", () => {
    it("does not show pagination for small result sets", () => {
      const result = makeResult(["id"], [[1], [2], [3]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      // No page navigation buttons
      expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
    });

    it("shows pagination for large result sets", () => {
      const rows = Array.from({ length: 100 }, (_, i) => [i]);
      const result = makeResult(["id"], rows);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });
  });

  // ── Copy to clipboard ────────────────────────────────────────
  describe("copy to clipboard", () => {
    it("shows copy button", () => {
      const result = makeResult(["name"], [["Alice"]]);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
  });

  // ── Multiple rows ────────────────────────────────────────────
  describe("multiple rows", () => {
    it("renders all visible rows", () => {
      const rows = Array.from({ length: 10 }, (_, i) => [`row${i}`, i]);
      const result = makeResult(["name", "id"], rows);
      render(<ResultsTable result={result} error={null} isRunning={false} />);
      // Check first and last row rendered
      expect(screen.getByText("row0")).toBeInTheDocument();
      expect(screen.getByText("row9")).toBeInTheDocument();
    });
  });
});
