"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Loader2, Database, Zap, Minus, Plus, Clock, GitBranch, Code2, Eraser, Upload, Download, FileText, FileJson, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchemaExplorer } from "./schema-explorer";
import { SqlEditor, type SqlEditorHandle } from "./sql-editor";
import { ResultsTable } from "./results-table";
import { ExplainPlan } from "./explain-plan";
import { ThemeSwitcher } from "./theme-switcher";
import { QueryHistory, addToHistory } from "./query-history";
import { SchemaDiagram } from "./schema-diagram";
import { DuckDBEngine } from "@/engine/duckdb-engine";
import type { QueryResult, SchemaInfo } from "@/engine/types";
import {
  parseCsv,
  parseJson,
  resultToCsv,
  resultToJson,
  downloadFile,
} from "./file-io";

const EMPTY_QUERY = "";

type ViewMode = "sql" | "diagram";

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 256; // matches the previous fixed w-64

export function SqlPlayground() {
  const [engine] = useState(() => new DuckDBEngine());
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [sql, setSql] = useState(EMPTY_QUERY);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [explainResult, setExplainResult] = useState<{ plan: string[]; isAnalyze: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dbfly-sidebar-width");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH)
          return n;
      }
    }
    return SIDEBAR_DEFAULT_WIDTH;
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("sql");
  const [importOpen, setImportOpen] = useState(false);
  const [importTableName, setImportTableName] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<{ content: string; name: string; type: "csv" | "json" } | null>(null);
  const [editorHeight, setEditorHeight] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dbfly-editor-height");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 100 && n <= 2000) return n;
      }
    }
    return 300;
  });
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dbfly-font-size");
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 10 && n <= 32) return n;
      }
    }
    return 14;
  });
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const editorHandleRef = useRef<SqlEditorHandle | null>(null);
  const sqlRef = useRef(sql);
  sqlRef.current = sql;

  // Persist editor height
  useEffect(() => {
    localStorage.setItem("dbfly-editor-height", String(editorHeight));
  }, [editorHeight]);

  // Persist sidebar width
  useEffect(() => {
    localStorage.setItem("dbfly-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  // Persist font size
  useEffect(() => {
    localStorage.setItem("dbfly-font-size", String(fontSize));
  }, [fontSize]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startYRef.current = e.clientY;
    startHeightRef.current = editorHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startYRef.current;
      const newHeight = Math.max(100, Math.min(2000, startHeightRef.current + delta));
      setEditorHeight(newHeight);
    };
    const handleMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [editorHeight]);

  // Drag the divider next to the Schema panel to resize its width
  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      const newWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, startWidthRef.current + delta)
      );
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sidebarWidth]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await engine.initialize();
        if (cancelled) return;

        const schemaInfo = await engine.getSchema();
        setSchema(schemaInfo);
        setIsInitializing(false);
      } catch (err) {
        console.error("Failed to initialize:", err);
        setInitError(
          err instanceof Error ? err.message : "Failed to initialize DuckDB"
        );
        setIsInitializing(false);
      }
    }

    init();
    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, [engine]);

  const refreshSchema = useCallback(async () => {
    try {
      const schemaInfo = await engine.getSchema();
      setSchema(schemaInfo);
    } catch {
      // ignore
    }
  }, [engine]);

  const runQuery = useCallback(async () => {
    const currentSql = sqlRef.current;
    if (!currentSql.trim() || isRunning) return;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setExplainResult(null);

    try {
      const trimmed = currentSql.trim();
      const upper = trimmed.toUpperCase().trimStart();

      // Check for EXPLAIN
      if (upper.startsWith("EXPLAIN")) {
        const explainResult = await engine.queryExplain(trimmed);
        // Parse the plan from the result
        const planLines = explainResult.rows.map(r => String(r[0] ?? ""));
        const isAnalyze = upper.includes("ANALYZE");
        setExplainResult({ plan: planLines, isAnalyze });
        addToHistory(trimmed);
      } else {
        const queryResult = await engine.query(trimmed);
        setResult(queryResult);
        addToHistory(trimmed);
      }

      // Refresh schema after DDL statements
      await refreshSchema();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cleanError = msg
        .replace(/Binder Error: /g, "")
        .replace(/Parser Error: /g, "")
        .replace(/Catalog Error: /g, "")
        .replace(/Invalid Input Error: /g, "")
        .replace(/Transaction Error: /g, "");
      setError(cleanError);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, engine, refreshSchema]);

  // Import file handler
  const handleImportFile = useCallback(async () => {
    const pending = pendingFileRef.current;
    if (!pending || !importTableName.trim()) return;

    setImportLoading(true);
    setImportStatus(null);

    try {
      const result = await engine.importFile(
        pending.name,
        pending.content,
        importTableName.trim(),
        pending.type
      );
      setImportStatus(`✓ Imported ${result.rowCount.toLocaleString()} rows into "${result.tableName}"`);
      await refreshSchema();
      pendingFileRef.current = null;
      setTimeout(() => setImportOpen(false), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus(`✗ Error: ${msg}`);
    } finally {
      setImportLoading(false);
    }
  }, [engine, importTableName, refreshSchema]);

  // File input change handler
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "json") {
      setImportStatus("✗ Only .csv and .json files are supported");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      // Auto-suggest table name from filename
      const suggestedName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
      setImportTableName(suggestedName);
      pendingFileRef.current = {
        content,
        name: file.name,
        type: ext as "csv" | "json",
      };
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  // Export handlers
  const handleExportCsv = useCallback(() => {
    if (!result) return;
    const csv = resultToCsv(result);
    downloadFile(csv, "query_result.csv", "text/csv;charset=utf-8");
  }, [result]);

  const handleExportJson = useCallback(() => {
    if (!result) return;
    const json = resultToJson(result);
    downloadFile(json, "query_result.json", "application/json;charset=utf-8");
  }, [result]);

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#0d1117]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Zap className="h-12 w-12 text-amber-500" />
            <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin text-amber-500" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              DBFly
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Initializing DuckDB-Wasm...
            </p>
          </div>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full animate-pulse rounded-full bg-amber-500/50" />
          </div>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#0d1117]">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Failed to initialize
          </h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-300">
            {initError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-[#0d1117] text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-[#21262d] px-4 py-2 bg-white dark:bg-[#161b22]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <h1 className="text-base font-bold">DBFly</h1>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">|</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            SQL Playground
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            DuckDB-Wasm &bull; In-Memory
          </span>
          <ThemeSwitcher />
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside
            style={{ width: sidebarWidth }}
            className="flex shrink-0 flex-col overflow-hidden bg-gray-50 dark:bg-[#161b22]"
          >
            <SchemaExplorer schema={schema} isLoading={false} />
          </aside>
        )}

        {/* Sidebar width drag handle (double-click resets) */}
        {sidebarOpen && (
          <div
            onMouseDown={handleSidebarDragStart}
            onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
            title="Drag to resize schema panel"
            className="group z-10 flex w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-gray-50 transition-colors hover:bg-gray-100 dark:bg-[#161b22] dark:hover:bg-[#1c2128]"
          >
            <div className="h-full w-px bg-gray-200 transition-all group-hover:w-[2px] group-hover:bg-amber-400/70 dark:bg-[#21262d] dark:group-hover:bg-amber-500/70" />
          </div>
        )}

        {/* Query History panel */}
        <QueryHistory
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onSelect={(sqlText) => {
            setSql(sqlText);
            setHistoryOpen(false);
            editorHandleRef.current?.setValue(sqlText);
          }}
        />

        {/* Import dialog */}
        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-[#21262d] dark:bg-[#161b22]">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Import CSV / JSON
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Upload a CSV or JSON file to create a new table.
              </p>

              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 p-4 text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600 dark:border-[#21262d] dark:text-gray-400 dark:hover:border-amber-500"
                >
                  <Upload className="h-5 w-5" />
                  {pendingFileRef.current ? pendingFileRef.current.name : "Choose file..."}
                </button>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Table name
                </label>
                <input
                  type="text"
                  value={importTableName}
                  onChange={(e) => setImportTableName(e.target.value)}
                  placeholder="my_table"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-[#21262d] dark:bg-[#0d1117]"
                />
              </div>

              {importStatus && (
                <div className={`mt-3 text-sm ${importStatus.startsWith("✓") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {importStatus}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportOpen(false);
                    pendingFileRef.current = null;
                    setImportStatus(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleImportFile}
                  disabled={!pendingFileRef.current || !importTableName.trim() || importLoading}
                >
                  {importLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-[#21262d] px-3 py-1.5 bg-white dark:bg-[#0d1117]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="h-7 text-xs"
            >
              <Database className="mr-1 h-3.5 w-3.5" />
              {sidebarOpen ? "Hide" : "Show"} Schema
            </Button>

            {/* View mode selector */}
            <div className="flex items-center rounded-md border border-gray-200 dark:border-[#21262d] overflow-hidden">
              <button
                onClick={() => setViewMode("sql")}
                className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
                  viewMode === "sql"
                    ? "bg-gray-100 dark:bg-[#21262d] font-medium text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Code2 className="h-3 w-3" />
                SQL
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-[#21262d]" />
              <button
                onClick={() => setViewMode("diagram")}
                className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
                  viewMode === "diagram"
                    ? "bg-gray-100 dark:bg-[#21262d] font-medium text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <GitBranch className="h-3 w-3" />
                Diagram
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Import button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="h-7 text-xs"
                title="Import CSV/JSON"
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>

              {/* Export buttons */}
              {result && result.columns.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-7 text-xs"
                    title="Export as CSV"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExportJson}
                    className="h-7 text-xs"
                    title="Export as JSON"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}

              {/* History toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(!historyOpen)}
                className={`h-7 text-xs ${historyOpen ? "bg-gray-100 dark:bg-[#21262d]" : ""}`}
                title="Query History"
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>

              {/* Font size control */}
              <div className="flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-[#21262d] px-1">
                <button
                  onClick={() => setFontSize((s) => Math.max(10, s - 1))}
                  className="p-0.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title="Decrease font size"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="min-w-[28px] text-center text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                  {fontSize}px
                </span>
                <button
                  onClick={() => setFontSize((s) => Math.min(32, s + 1))}
                  className="p-0.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  title="Increase font size"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <Button
                size="sm"
                onClick={runQuery}
                disabled={isRunning || !sql.trim()}
                className="h-7 gap-1.5 text-xs"
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Run Query
              </Button>
            </div>
          </div>

          {/* Content based on view mode */}
          {viewMode === "diagram" ? (
            <div className="flex-1 overflow-hidden">
              <SchemaDiagram
                schema={schema}
                onClose={() => setViewMode("sql")}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Editor */}
              <div style={{ height: editorHeight, minHeight: 100 }} className="shrink-0 border-b border-gray-200 dark:border-[#21262d] p-2">
                <div className="relative h-full w-full">
                  <SqlEditor
                    ref={editorHandleRef}
                    value={sql}
                    onChange={setSql}
                    onRunQuery={runQuery}
                    isRunning={isRunning}
                    schema={schema}
                    fontSize={fontSize}
                  />
                  {/* Clear button */}
                  {sql && (
                    <button
                      onClick={() => {
                        setSql("");
                        editorHandleRef.current?.setValue("");
                      }}
                      className="absolute right-3 top-3 z-10 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-gray-300"
                      title="Clear editor"
                    >
                      <Eraser className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Drag handle */}
              <div
                onMouseDown={handleDragStart}
                className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center border-b border-gray-200 dark:border-[#21262d] bg-gray-50 hover:bg-gray-100 dark:bg-[#161b22] dark:hover:bg-[#1c2128]"
              >
                <div className="h-0.5 w-8 rounded-full bg-gray-300 transition-colors group-hover:bg-gray-400 dark:bg-gray-600 dark:group-hover:bg-gray-500" />
              </div>

              {/* Results */}
              <div className="flex-1 overflow-hidden">
                {explainResult ? (
                  <ExplainPlan
                    plan={explainResult.plan}
                    executionTimeMs={0}
                    isAnalyze={explainResult.isAnalyze}
                  />
                ) : (
                  <ResultsTable
                    result={result}
                    error={error}
                    isRunning={isRunning}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
