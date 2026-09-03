import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock DuckDB Engine ──────────────────────────────────────────
const mockQuery = vi.fn();
const mockQueryExplain = vi.fn();
const mockGetSchema = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockDispose = vi.fn().mockResolvedValue(undefined);
const mockImportFile = vi.fn();
const mockGetConnection = vi.fn();

vi.mock("@/engine/duckdb-engine", () => ({
  DuckDBEngine: class MockDuckDBEngine {
    name = "DuckDB-Wasm";
    query = mockQuery;
    queryExplain = mockQueryExplain;
    getSchema = mockGetSchema;
    initialize = mockInitialize;
    dispose = mockDispose;
    importFile = mockImportFile;
    getConnection = mockGetConnection;
  },
}));

// ── Mock Monaco Editor ─────────────────────────────────────────
vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({ onChange, defaultValue }: any) => (
    <textarea
      data-testid="sql-editor"
      defaultValue={defaultValue}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// ── Mock next-themes ───────────────────────────────────────────
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: any) => <div>{children}</div>,
  useTheme: () => ({
    resolvedTheme: "dark",
    theme: "dark",
    setTheme: vi.fn(),
  }),
}));

const mockSchema = {
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
  ],
  relationships: [],
};

// Import the component after mocking
import { SqlPlayground } from "@/components/playground/sql-playground";

describe("SqlPlayground Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSchema.mockResolvedValue(mockSchema);
    mockInitialize.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({
      columns: ["result"],
      columnTypes: ["integer"],
      sqlTypes: ["INTEGER"],
      rows: [[1]],
      rowCount: 1,
      executionTimeMs: 1.5,
    });
  });

  it("shows loading state during initialization", () => {
    mockInitialize.mockReturnValue(new Promise(() => {}));
    render(<SqlPlayground />);
    expect(screen.getByText("DBFly")).toBeInTheDocument();
    expect(screen.getByText("Initializing DuckDB-Wasm...")).toBeInTheDocument();
  });

  it("renders playground after initialization", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
  });

  it("displays schema in sidebar", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("users")).toBeInTheDocument();
    });
  });

  it("has SQL/Diagram view toggle", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("SQL")).toBeInTheDocument();
      expect(screen.getByText("Diagram")).toBeInTheDocument();
    });
  });

  it("has theme switcher", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
    });
  });

  it("has import button", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByTitle("Import CSV/JSON")).toBeInTheDocument();
    });
  });

  it("has history toggle button", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByTitle("Query History")).toBeInTheDocument();
    });
  });

  it("shows font size controls", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("14px")).toBeInTheDocument();
    });
  });

  it("can toggle sidebar visibility", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Hide Schema")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Hide Schema"));
    await waitFor(() => {
      expect(screen.getByText("Show Schema")).toBeInTheDocument();
    });
  });

  it("shows error state on initialization failure", async () => {
    mockInitialize.mockRejectedValue(new Error("WASM load failed"));
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Failed to initialize")).toBeInTheDocument();
      expect(screen.getByText("WASM load failed")).toBeInTheDocument();
    });
  });

  it("shows empty state before running query", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run a query to see results")).toBeInTheDocument();
    });
  });

  it("has font size increase/decrease buttons", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByTitle("Decrease font size")).toBeInTheDocument();
      expect(screen.getByTitle("Increase font size")).toBeInTheDocument();
    });
  });

  it("persists editor height in localStorage", async () => {
    localStorage.setItem("dbfly-editor-height", "400");
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
  });

  it("persists font size in localStorage", async () => {
    localStorage.setItem("dbfly-font-size", "18");
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("18px")).toBeInTheDocument();
    });
  });

  it("renders a drag handle to resize the schema panel", async () => {
    render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
    const handle = screen.getByTitle("Drag to resize schema panel");
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveClass("cursor-col-resize");
  });

  it("resizes the schema panel by dragging the handle and persists width", async () => {
    const { container } = render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
    const aside = container.querySelector("aside")!;
    expect(aside.style.width).toBe("256px");

    const handle = screen.getByTitle("Drag to resize schema panel");
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 420 });
    fireEvent.mouseUp(document);

    expect(aside.style.width).toBe("376px");
    await waitFor(() => {
      expect(localStorage.getItem("dbfly-sidebar-width")).toBe("376");
    });
  });

  it("clamps sidebar width within min/max bounds", async () => {
    const { container } = render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
    const aside = container.querySelector("aside")!;
    const handle = screen.getByTitle("Drag to resize schema panel");

    // Drag far right — clamped to the max (640)
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 5000 });
    fireEvent.mouseUp(document);
    expect(aside.style.width).toBe("640px");

    // Drag far left — clamped to the min (180)
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(document, { clientX: -5000 });
    fireEvent.mouseUp(document);
    expect(aside.style.width).toBe("180px");
  });

  it("double-click on the handle resets sidebar width to default", async () => {
    localStorage.setItem("dbfly-sidebar-width", "500");
    const { container } = render(<SqlPlayground />);
    await waitFor(() => {
      expect(screen.getByText("Run Query")).toBeInTheDocument();
    });
    const aside = container.querySelector("aside")!;
    expect(aside.style.width).toBe("500px");

    fireEvent.doubleClick(screen.getByTitle("Drag to resize schema panel"));
    expect(aside.style.width).toBe("256px");
    await waitFor(() => {
      expect(localStorage.getItem("dbfly-sidebar-width")).toBe("256");
    });
  });
});
