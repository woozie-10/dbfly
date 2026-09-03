"use client";

import { useState } from "react";
import {
  ChevronRight, ChevronDown, Database, Table,
  Hash, Type, ToggleLeft, Clock, CalendarDays,
  Binary, Braces, List, KeyRound, Timer, Asterisk, Key,
} from "lucide-react";
import type { SchemaInfo, SchemaTable, SchemaColumn } from "@/engine/types";

interface SchemaExplorerProps {
  schema: SchemaInfo | null;
  isLoading: boolean;
}

function ColumnIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  const cls = "h-3 w-3 shrink-0";

  if (t.includes("int") || t.includes("serial")) {
    return <Hash className={`${cls} text-blue-500`} />;
  }
  if (t.includes("decimal") || t.includes("numeric")) {
    return <Asterisk className={`${cls} text-emerald-500`} />;
  }
  if (t.includes("float") || t.includes("double") || t.includes("real")) {
    return <Asterisk className={`${cls} text-emerald-400`} />;
  }
  if (t.includes("bool")) {
    return <ToggleLeft className={`${cls} text-purple-500`} />;
  }
  if (t.includes("timestamp")) {
    return <Clock className={`${cls} text-orange-500`} />;
  }
  if (t === "date" || t.includes("date")) {
    return <CalendarDays className={`${cls} text-orange-400`} />;
  }
  if (t.includes("time") && !t.includes("timestamp")) {
    return <Timer className={`${cls} text-orange-400`} />;
  }
  if (t.includes("interval")) {
    return <Timer className={`${cls} text-amber-500`} />;
  }
  if (t.includes("blob") || t.includes("binary")) {
    return <Binary className={`${cls} text-gray-500`} />;
  }
  if (t.includes("json")) {
    return <Braces className={`${cls} text-pink-500`} />;
  }
  if (t.includes("struct")) {
    return <Braces className={`${cls} text-violet-500`} />;
  }
  if (t.includes("list") || t.includes("array") || t.endsWith("[]")) {
    return <List className={`${cls} text-cyan-500`} />;
  }
  if (t.includes("uuid")) {
    return <KeyRound className={`${cls} text-yellow-500`} />;
  }
  return <Type className={`${cls} text-gray-400`} />;
}

function ColumnNode({ col }: { col: SchemaColumn }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
      <ColumnIcon type={col.type} />
      {col.isPrimaryKey && <Key className="h-2.5 w-2.5 shrink-0 text-amber-500" />}
      <span className="font-mono">{col.name}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500">
        {col.type}
      </span>
    </div>
  );
}

function TableNode({ table }: { table: SchemaTable }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <Table className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span className="font-mono text-xs font-medium">{table.name}</span>
        <span className="ml-auto flex items-center gap-1">
          {table.rowCount !== undefined && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {table.rowCount.toLocaleString()} rows
            </span>
          )}
          <span className="rounded bg-gray-100 dark:bg-[#21262d] px-1 text-[10px] text-gray-500 dark:text-gray-400">
            {table.columns.length}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-gray-200 dark:border-[#21262d] pl-2">
          {/* Columns */}
          <div className="py-0.5">
            {table.columns.map((col) => (
              <ColumnNode key={col.name} col={col} />
            ))}
          </div>

        </div>
      )}
    </div>
  );
}

export function SchemaExplorer({ schema, isLoading }: SchemaExplorerProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-[#21262d] px-3 py-2">
        <Database className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Schema
        </span>
        {schema && (
          <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
            {schema.tables.length} tables
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : schema && schema.tables.length > 0 ? (
          <div className="space-y-0.5">
            {schema.tables.map((table) => (
              <TableNode key={table.name} table={table} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Table className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              No tables yet
            </p>
            <p className="mt-1 text-[10px] text-gray-300 dark:text-gray-600">
              CREATE TABLE to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
