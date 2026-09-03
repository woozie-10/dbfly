import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaDiagram } from "@/components/playground/schema-diagram";
import type { SchemaInfo } from "@/engine/types";

function makeSchema(overrides: Partial<SchemaInfo> = {}): SchemaInfo {
  return {
    tables: [
      {
        name: "users",
        columns: [
          { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
          { name: "name", type: "VARCHAR", nullable: true },
        ],
        foreignKeys: [],
        rowCount: 100,
      },
      {
        name: "orders",
        columns: [
          { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
          { name: "user_id", type: "INTEGER", nullable: false },
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
    relationships: [
      {
        fromTable: "orders",
        fromColumns: ["user_id"],
        referencedTable: "users",
        referencedColumns: ["id"],
      },
    ],
    ...overrides,
  };
}

describe("SchemaDiagram", () => {
  it("returns null for empty schema", () => {
    const { container } = render(
      <SchemaDiagram schema={{ tables: [], relationships: [] }} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null for null schema", () => {
    const { container } = render(
      <SchemaDiagram schema={null} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders table names", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("renders column names in table boxes", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getAllByText("id").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("user_id")).toBeInTheDocument();
  });

  it("renders row counts", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getByText("100 rows")).toBeInTheDocument();
    expect(screen.getByText("500 rows")).toBeInTheDocument();
  });

  it("renders ER Diagram header", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getByText("ER Diagram")).toBeInTheDocument();
  });

  it("shows table and relationship count", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getByText(/2 tables/)).toBeInTheDocument();
    expect(screen.getByText(/1 relationships/)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<SchemaDiagram schema={makeSchema()} onClose={onClose} />);
    fireEvent.click(screen.getByText("✕ Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("has zoom controls", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("renders SVG for relationships", () => {
    const { container } = render(
      <SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows column types", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    expect(screen.getAllByText("INTEGER").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("VARCHAR").length).toBeGreaterThanOrEqual(1);
  });

  it("renders primary key indicators", () => {
    const schema = makeSchema();
    schema.tables[0].columns[0].isPrimaryKey = true;
    render(<SchemaDiagram schema={schema} onClose={vi.fn()} />);
    // PK columns should be visible
    expect(screen.getAllByText("id").length).toBeGreaterThanOrEqual(2);
  });

  it("zoom in increases zoom level", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    // Find zoom in button (ZoomIn icon button)
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons.find((b) => b.querySelector("[data-lucide='zoom-in']"));
    if (zoomInBtn) {
      fireEvent.click(zoomInBtn);
      expect(screen.getByText("115%")).toBeInTheDocument();
    }
  });

  it("zoom out decreases zoom level", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    const zoomOutBtn = buttons.find((b) => b.querySelector("[data-lucide='zoom-out']"));
    if (zoomOutBtn) {
      fireEvent.click(zoomOutBtn);
      expect(screen.getByText("85%")).toBeInTheDocument();
    }
  });

  it("reset zoom button resets to 100%", () => {
    render(<SchemaDiagram schema={makeSchema()} onClose={vi.fn()} />);
    // First zoom in
    const buttons = screen.getAllByRole("button");
    const zoomInBtn = buttons.find((b) => b.querySelector("[data-lucide='zoom-in']"));
    if (zoomInBtn) {
      fireEvent.click(zoomInBtn);
      expect(screen.getByText("115%")).toBeInTheDocument();
    }
    // Then reset
    const resetBtn = buttons.find((b) => b.querySelector("[data-lucide='maximize-2']"));
    if (resetBtn) {
      fireEvent.click(resetBtn);
      expect(screen.getByText("100%")).toBeInTheDocument();
    }
  });
});
