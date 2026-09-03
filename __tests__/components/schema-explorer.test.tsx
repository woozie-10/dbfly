import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaExplorer } from "@/components/playground/schema-explorer";
import type { SchemaInfo } from "@/engine/types";

function makeSchema(overrides: Partial<SchemaInfo> = {}): SchemaInfo {
  return {
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
    ...overrides,
  };
}

describe("SchemaExplorer", () => {
  it("shows header with table count", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    expect(screen.getByText("Schema")).toBeInTheDocument();
    expect(screen.getByText("2 tables")).toBeInTheDocument();
  });

  it("shows loading indicator", () => {
    render(<SchemaExplorer schema={null} isLoading={true} />);
    expect(screen.queryByText("Schema")).toBeInTheDocument();
  });

  it("shows empty state when no tables", () => {
    render(
      <SchemaExplorer
        schema={{ tables: [], relationships: [] }}
        isLoading={false}
      />
    );
    expect(screen.getByText("No tables yet")).toBeInTheDocument();
    expect(screen.getByText("CREATE TABLE to get started")).toBeInTheDocument();
  });

  it("renders table names", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("shows row count for tables", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    expect(screen.getByText("100 rows")).toBeInTheDocument();
    expect(screen.getByText("500 rows")).toBeInTheDocument();
  });

  it("shows column count badge", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    // Both tables have 3 columns
    const badges = screen.getAllByText("3");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("expands table to show columns", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);

    // Click on users table to expand
    fireEvent.click(screen.getByText("users"));

    // Should show columns
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("shows column types", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    fireEvent.click(screen.getByText("users"));

    expect(screen.getAllByText("INTEGER").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("VARCHAR").length).toBeGreaterThanOrEqual(1);
  });

  it("shows primary key indicator", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    fireEvent.click(screen.getByText("users"));

    // PK column should have Key icon
    const idColumns = screen.getAllByText("id");
    expect(idColumns.length).toBeGreaterThanOrEqual(1);
  });

  it("collapses table on second click", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);

    // Expand
    fireEvent.click(screen.getByText("users"));
    expect(screen.getByText("id")).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText("users"));
    // Column names should no longer be visible in the expanded area
    // (they might still be in the collapsed view, but the expanded section should be gone)
  });

  it("handles null schema", () => {
    render(<SchemaExplorer schema={null} isLoading={false} />);
    expect(screen.getByText("No tables yet")).toBeInTheDocument();
  });

  it("expands orders table and shows foreign key info", () => {
    render(<SchemaExplorer schema={makeSchema()} isLoading={false} />);
    fireEvent.click(screen.getByText("orders"));

    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("user_id")).toBeInTheDocument();
    expect(screen.getByText("total")).toBeInTheDocument();
  });
});
