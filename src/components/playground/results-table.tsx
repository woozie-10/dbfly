"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueryResult, ColumnType } from "@/engine/types";

interface ResultsTableProps {
  result: QueryResult | null;
  error: string | null;
  isRunning: boolean;
}

const PAGE_SIZE = 50;

// ─── Cell renderer ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCell(value: any, colType: ColumnType) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 italic dark:bg-gray-800/50 dark:text-gray-500">
        <span className="inline-block h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        NULL
      </span>
    );
  }

  // Boolean
  if (typeof value === "boolean" || colType === "boolean") {
    const b = !!value;
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
          b
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
        }`}
      >
        {b ? "TRUE" : "FALSE"}
      </span>
    );
  }

  // JSON / STRUCT / MAP — render as formatted object
  if (typeof value === "object" && value !== null && colType === "json") {
    return (
      <span className="max-w-[400px] truncate font-mono text-xs text-purple-700 dark:text-purple-300">
        {JSON.stringify(value)}
      </span>
    );
  }

  // Any other object (STRUCT, MAP from DuckDB Arrow proxy)
  if (typeof value === "object" && value !== null) {
    try {
      const json = JSON.stringify(value);
      return (
        <span className="max-w-[400px] truncate font-mono text-xs text-purple-700 dark:text-purple-300">
          {json}
        </span>
      );
    } catch {
      return (
        <span className="max-w-[300px] truncate">{String(value)}</span>
      );
    }
  }

  // BigInt as string (from bigint/hugeint/decimal columns)
  if (typeof value === "string" && (colType === "bigint" || colType === "hugeint" || colType === "decimal")) {
    return (
      <span className="tabular-nums font-mono text-xs">{value}</span>
    );
  }

  // Integer — show with locale formatting
  if (typeof value === "number" && colType === "integer") {
    return (
      <span className="tabular-nums font-mono text-xs">
        {value.toLocaleString()}
      </span>
    );
  }

  // Float — preserve full precision from Arrow (do not round)
  if (typeof value === "number" && colType === "float") {
    return (
      <span className="tabular-nums font-mono text-xs">
        {Object.is(value, -0) ? "-0" : value}
      </span>
    );
  }

  // Number (generic)
  if (typeof value === "number") {
    return (
      <span className="tabular-nums font-mono text-xs">
        {Number.isInteger(value)
          ? value.toLocaleString()
          : value.toLocaleString(undefined, {
              maximumFractionDigits: 10,
            })}
      </span>
    );
  }

  // String (all remaining types: date, timestamp, time, interval, blob, uuid, varchar)
  if (typeof value === "string") {
    // Blob has newlines (hex dump)
    if (value.includes("\n")) {
      const lines = value.split("\n");
      const label = lines[0];
      const hex = lines.slice(1).join("\n");
      return (
        <div className="max-w-[400px]">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {label}
          </span>
          <pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-[10px] text-gray-600 dark:text-gray-400">
            {hex}
          </pre>
        </div>
      );
    }

    // Timestamp/date/time strings — monospace
    if (colType === "timestamp" || colType === "date" || colType === "time") {
      return <span className="tabular-nums font-mono text-xs">{value}</span>;
    }

    // Interval
    if (colType === "interval") {
      return (
        <span className="font-mono text-xs text-amber-700 dark:text-amber-300">
          {value}
        </span>
      );
    }

    // UUID
    if (colType === "uuid") {
      return (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {value}
        </span>
      );
    }

    // Regular string
    return (
      <span className="max-w-[300px] truncate font-mono text-xs">
        {value}
      </span>
    );
  }

  // Fallback
  return <span className="font-mono text-xs">{String(value)}</span>;
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareCells(a: any, b: any): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  // Try numeric comparison for strings that look like numbers (DECIMAL, etc.)
  if (typeof a === "string" && typeof b === "string") {
    const na = Number(a);
    const nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return String(a).localeCompare(String(b));
}

// ─── Column resize hook ─────────────────────────────────────────────────────

function useColumnResize(initialWidths: number[]) {
  const [widths, setWidths] = useState(initialWidths);
  const resizing = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const delta = e.clientX - resizing.current.startX;
      const newWidth = Math.max(60, resizing.current.startWidth + delta);
      setWidths((prev) => {
        const next = [...prev];
        next[resizing.current!.colIdx] = newWidth;
        return next;
      });
    };
    const onMouseUp = () => {
      if (resizing.current) {
        resizing.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { colIdx, startX: e.clientX, startWidth: widths[colIdx] ?? 120 };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [widths]);

  return { widths, setWidths, startResize };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResultsTable({ result, error, isRunning }: ResultsTableProps) {
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const colCount = result?.columns.length ?? 0;
  const { widths, setWidths, startResize } = useColumnResize(
    useMemo(() => Array(colCount).fill(120), [colCount])
  );

  // Reset sort + page on new result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    setSortCol(null);
    setSortDir(null);
    setPage(0);
    setWidths(Array(result?.columns.length ?? 0).fill(120));
  }, [result]);

  const handleSort = useCallback((colIdx: number) => {
    setSortCol((prev) => {
      if (prev === colIdx) {
        setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
        return colIdx;
      }
      setSortDir("asc");
      return colIdx;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!result) return [];
    if (sortCol === null || sortDir === null) return result.rows;
    const rows = [...result.rows];
    rows.sort((a, b) => {
      const cmp = compareCells(a[sortCol], b[sortCol]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [result, sortCol, sortDir]);

  const totalPages = useMemo(
    () => (result ? Math.ceil(sortedRows.length / PAGE_SIZE) : 0),
    [result, sortedRows.length]
  );

  const visibleRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const copyResults = useCallback(() => {
    if (!result || result.columns.length === 0) return;
    const header = result.columns.join("\t");
    const lines = result.rows.map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "NULL";
          if (typeof cell === "object") return JSON.stringify(cell);
          const s = String(cell);
          return s.includes("\t") || s.includes("\n") || s.includes('"')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join("\t")
    );
    const tsv = [header, ...lines].join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [result]);

  // ── Empty / Error / Loading states ──────────────────────────────────────

  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Executing query...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-start p-4 bg-white dark:bg-[#0d1117]">
        <div className="w-full rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              !
            </span>
            Query Error
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-red-600 dark:text-red-400">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-[#0d1117]">
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Run a query to see results
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Press Ctrl/Cmd + Enter or click Run Query
          </p>
        </div>
      </div>
    );
  }

  if (result.columns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-white dark:bg-[#0d1117]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Query executed successfully
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {result.executionTimeMs.toFixed(1)}ms
        </p>
      </div>
    );
  }

  const colTypes = result.columnTypes ?? result.columns.map(() => "string" as ColumnType);
  const sqlTypes = result.sqlTypes ?? result.columns.map(() => "");

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#0d1117]">
      {/* Results toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-[#21262d] px-3 py-1.5">
        <span className="rounded-md bg-gray-100 dark:bg-[#21262d] px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
          {result.rowCount.toLocaleString()} rows
        </span>
        <span className="rounded-md border border-gray-200 dark:border-[#21262d] px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
          {result.executionTimeMs.toFixed(1)}ms
        </span>
        <button
          onClick={copyResults}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-[#21262d] dark:hover:text-gray-300"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPage(0)} disabled={page === 0}>
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {page + 1} / {totalPages}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Table with horizontal + vertical scroll */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {result.columns.map((_, i) => (
              <col key={i} style={{ width: widths[i] }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#161b22]">
            <tr>
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="relative border-b border-r border-gray-200 dark:border-[#21262d] px-3 py-1.5 text-left font-semibold text-gray-900 dark:text-gray-100"
                >
                  <div
                    className="flex cursor-pointer items-center gap-1.5 select-none"
                    onClick={() => handleSort(i)}
                  >
                    <span className="truncate">{col}</span>
                    <span className="shrink-0 text-[9px] font-normal text-gray-400 dark:text-gray-500">
                      {sqlTypes[i]}
                    </span>
                    <span className="ml-auto shrink-0">
                      {sortCol === i && sortDir === "asc" && <ArrowUp className="h-3 w-3 text-amber-500" />}
                      {sortCol === i && sortDir === "desc" && <ArrowDown className="h-3 w-3 text-amber-500" />}
                      {sortCol !== i && <ArrowUpDown className="h-3 w-3 text-gray-300 dark:text-gray-600" />}
                    </span>
                  </div>
                  {/* Column resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-amber-400/50"
                    onMouseDown={(e) => startResize(i, e)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-gray-100 dark:border-[#21262d] last:border-0 hover:bg-gray-50 dark:hover:bg-[#161b22]"
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="border-r border-gray-100 px-3 py-1.5 font-mono text-xs align-top dark:border-[#21262d]"
                  >
                    {renderCell(cell, colTypes[cellIdx] ?? "string")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
