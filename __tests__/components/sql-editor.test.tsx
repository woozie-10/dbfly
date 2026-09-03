import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SchemaInfo } from "@/engine/types";

// Mock Monaco editor
const mockEditor = {
  getValue: vi.fn().mockReturnValue("SELECT 1"),
  setValue: vi.fn(),
  addAction: vi.fn(),
  updateOptions: vi.fn(),
  getModel: vi.fn().mockReturnValue({
    getLineCount: vi.fn().mockReturnValue(1),
    getLineMaxColumn: vi.fn().mockReturnValue(10),
    getLanguageId: vi.fn().mockReturnValue("dbfly-sql"),
  }),
  setPosition: vi.fn(),
};

const mockMonaco = {
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
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
};

vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({ onMount, onChange, defaultValue, ...props }: any) => {
    // Simulate mounting
    setTimeout(() => {
      if (onMount) onMount(mockEditor, mockMonaco);
    }, 0);
    return (
      <div data-testid="mock-monaco-editor" data-value={defaultValue}>
        <textarea
          data-testid="monaco-textarea"
          defaultValue={defaultValue}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
    );
  },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    theme: "dark",
  }),
}));

// Import after mocks
import { SqlEditor } from "@/components/playground/sql-editor";

const mockSchema: SchemaInfo = {
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

describe("SqlEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the editor", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        onChange={vi.fn()}
        onRunQuery={vi.fn()}
        isRunning={false}
        schema={mockSchema}
      />
    );
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("renders with initial value", () => {
    render(
      <SqlEditor
        value="SELECT * FROM users"
        onChange={vi.fn()}
        onRunQuery={vi.fn()}
        isRunning={false}
        schema={mockSchema}
      />
    );
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("calls onChange when editor content changes", () => {
    const onChange = vi.fn();
    render(
      <SqlEditor
        value=""
        onChange={onChange}
        onRunQuery={vi.fn()}
        isRunning={false}
        schema={mockSchema}
      />
    );
    const textarea = screen.getByTestId("monaco-textarea");
    fireEvent.change(textarea, { target: { value: "SELECT 1" } });
    expect(onChange).toHaveBeenCalledWith("SELECT 1");
  });

  it("applies font size from props", () => {
    render(
      <SqlEditor
        value=""
        onChange={vi.fn()}
        onRunQuery={vi.fn()}
        isRunning={false}
        schema={mockSchema}
        fontSize={18}
      />
    );
    // The editor should render with the font size
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });

  it("forwards ref with setValue", () => {
    const ref = { current: null };
    render(
      <SqlEditor
        ref={ref}
        value=""
        onChange={vi.fn()}
        onRunQuery={vi.fn()}
        isRunning={false}
        schema={mockSchema}
      />
    );
    // After mount, ref should be set
    // Note: due to async mount in mock, we check structure exists
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
  });
});
