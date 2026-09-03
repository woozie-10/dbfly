"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import {
  Key, Link2, ZoomIn, ZoomOut, Maximize2,
  Hash, Type, ToggleLeft, Clock, CalendarDays,
  Binary, Braces, List, KeyRound, Timer, Asterisk,
} from "lucide-react";
import type { SchemaInfo, SchemaTable } from "@/engine/types";

interface SchemaDiagramProps {
  schema: SchemaInfo | null;
  onClose: () => void;
}

// ── Column type icon ──────────────────────────────────────────────────
function ColIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  const cls = "h-2.5 w-2.5 shrink-0";
  if (t.includes("int") || t.includes("serial"))
    return <Hash className={`${cls} text-blue-400`} />;
  if (t.includes("decimal") || t.includes("numeric"))
    return <Asterisk className={`${cls} text-emerald-400`} />;
  if (t.includes("float") || t.includes("double") || t.includes("real"))
    return <Asterisk className={`${cls} text-emerald-300`} />;
  if (t.includes("bool"))
    return <ToggleLeft className={`${cls} text-purple-400`} />;
  if (t.includes("timestamp"))
    return <Clock className={`${cls} text-orange-400`} />;
  if (t.includes("date"))
    return <CalendarDays className={`${cls} text-orange-300`} />;
  if (t.includes("time") && !t.includes("timestamp"))
    return <Timer className={`${cls} text-orange-300`} />;
  if (t.includes("interval"))
    return <Timer className={`${cls} text-amber-400`} />;
  if (t.includes("blob") || t.includes("binary"))
    return <Binary className={`${cls} text-gray-400`} />;
  if (t.includes("json") || t.includes("struct"))
    return <Braces className={`${cls} text-pink-400`} />;
  if (t.includes("list") || t.includes("array") || t.endsWith("[]"))
    return <List className={`${cls} text-cyan-400`} />;
  if (t.includes("uuid"))
    return <KeyRound className={`${cls} text-yellow-400`} />;
  return <Type className={`${cls} text-gray-400`} />;
}

// ── Table box ─────────────────────────────────────────────────────────
const TABLE_W = 224;

function TableBox({
  table, onDragStart, onMouseDown, position, tableId,
  highlightedFields,
  onFieldHover,
}: {
  table: SchemaTable;
  onDragStart: (tableId: string, e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  position: { x: number; y: number };
  tableId: string;
  highlightedFields: Set<string>;
  onFieldHover: (fieldKey: string | null) => void;
}) {
  const pkCols = new Set(table.columns.filter((c) => c.isPrimaryKey).map((c) => c.name));
  const fkCols = new Set(table.foreignKeys.flatMap((fk) => fk.fromColumns));

  return (
    <div
      className="absolute select-none"
      data-table={table.name}
      style={{ left: position.x, top: position.y, zIndex: 10, width: TABLE_W }}
      onMouseDown={onMouseDown}
    >
      <div className="rounded-lg border border-gray-200 bg-white shadow-md dark:border-[#30363d] dark:bg-[#161b22] dark:shadow-black/40">
        <div
          className="flex cursor-grab items-center gap-1.5 rounded-t-lg border-b border-gray-200 bg-gray-50 px-2.5 py-1.5 dark:border-[#30363d] dark:bg-[#1c2128] active:cursor-grabbing"
          onMouseDown={(e) => { e.stopPropagation(); onDragStart(tableId, e); }}
        >
          <Key className="h-3 w-3 text-emerald-500" />
          <span className="font-mono text-[11px] font-bold text-gray-800 dark:text-gray-200">{table.name}</span>
          <span className="ml-auto rounded bg-gray-200 px-1 text-[9px] text-gray-500 dark:bg-[#30363d] dark:text-gray-400">
            {table.rowCount?.toLocaleString() ?? "?"} rows
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {table.columns.map((col) => {
            const fieldKey = `${table.name}.${col.name}`;
            const isHighlighted = highlightedFields.has(fieldKey);
            return (
              <div
                key={col.name}
                data-column={col.name}
                data-table={table.name}
                className={`flex items-center gap-1 border-b border-gray-100 px-2 py-[3px] last:border-b-0 dark:border-[#21262d] transition-all duration-150 ${
                  isHighlighted
                    ? "bg-blue-100 dark:bg-blue-900/40 border-l-2 border-l-blue-500"
                    : ""
                }`}
                onMouseEnter={() => onFieldHover(fieldKey)}
                onMouseLeave={() => onFieldHover(null)}
              >
                {pkCols.has(col.name) ? <Key className="h-2.5 w-2.5 shrink-0 text-amber-500" />
                  : fkCols.has(col.name) ? <Link2 className="h-2.5 w-2.5 shrink-0 text-blue-400" />
                  : <ColIcon type={col.type} />}
                <span className={`flex-1 truncate font-mono text-[10px] ${isHighlighted ? "text-blue-700 dark:text-blue-300 font-bold" : "text-gray-700 dark:text-gray-300"}`}>{col.name}</span>
                <span className="shrink-0 text-[9px] text-gray-400 dark:text-gray-500">{col.type}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Auto-layout ───────────────────────────────────────────────────────
function autoLayout(tables: SchemaTable[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const COL_WIDTH = 280;
  const ROW_HEIGHT = 300;
  const COLS = Math.max(1, Math.floor(900 / COL_WIDTH));
  tables.forEach((table, i) => {
    positions[table.name] = {
      x: 40 + (i % COLS) * COL_WIDTH,
      y: 40 + Math.floor(i / COLS) * ROW_HEIGHT,
    };
  });
  return positions;
}

// ── Edge data ─────────────────────────────────────────────────────────
interface EdgeLine {
  x1: number; y1: number;
  x2: number; y2: number;
  label: string;
  fkTable: string; fkCol: string;
  pkTable: string; pkCol: string;
}

function readEdges(schema: SchemaInfo, containerRect: DOMRect, zoom: number, panX: number, panY: number): EdgeLine[] {
  const edges: EdgeLine[] = [];
  for (const rel of schema.relationships) {
    const fkCell = document.querySelector(`[data-table="${rel.fromTable}"][data-column="${rel.fromColumns[0]}"]`);
    const pkCell = document.querySelector(`[data-table="${rel.referencedTable}"][data-column="${rel.referencedColumns[0]}"]`);
    if (!fkCell || !pkCell) continue;
    const fkR = fkCell.getBoundingClientRect();
    const pkR = pkCell.getBoundingClientRect();
    edges.push({
      x1: (fkR.left + fkR.width / 2 - containerRect.left - panX) / zoom,
      y1: (fkR.top + fkR.height / 2 - containerRect.top - panY) / zoom,
      x2: (pkR.left + pkR.width / 2 - containerRect.left - panX) / zoom,
      y2: (pkR.top + pkR.height / 2 - containerRect.top - panY) / zoom,
      label: `${rel.fromColumns.join(", ")} → ${rel.referencedColumns.join(", ")}`,
      fkTable: rel.fromTable,
      fkCol: rel.fromColumns[0],
      pkTable: rel.referencedTable,
      pkCol: rel.referencedColumns[0],
    });
  }
  return edges;
}

// ── Build cubic bezier path between two points ────────────────────────
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Horizontal offset for curve — more for longer lines, min 30px
  const cpOff = Math.max(30, Math.min(Math.abs(dx) * 0.5, dist * 0.4));
  // Direction: exit right if target is right, exit left otherwise
  const dir = dx > 0 ? 1 : -1;
  const cp1x = x1 + cpOff * dir;
  const cp1y = y1;
  const cp2x = x2 - cpOff * dir;
  const cp2y = y2;
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

// ── Main diagram ──────────────────────────────────────────────────────
export function SchemaDiagram({ schema, onClose }: SchemaDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [edges, setEdges] = useState<EdgeLine[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);

  useEffect(() => { if (schema) setTablePositions(autoLayout(schema.tables)); }, [schema]);

  // Read edges from DOM after every paint
  useLayoutEffect(() => {
    if (!schema || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = readEdges(schema, rect, zoom, pan.x, pan.y);
    setEdges((prev) => {
      if (prev.length === next.length && prev.every((e, i) =>
        Math.abs(e.x1 - next[i].x1) < 1 && Math.abs(e.y1 - next[i].y1) < 1 &&
        Math.abs(e.x2 - next[i].x2) < 1 && Math.abs(e.y2 - next[i].y2) < 1
      )) return prev;
      return next;
    });
  });

  // Build set of highlighted fields based on hover
  const highlightedFields = new Set<string>();
  if (hoveredEdge !== null && edges[hoveredEdge]) {
    const e = edges[hoveredEdge];
    highlightedFields.add(`${e.fkTable}.${e.fkCol}`);
    highlightedFields.add(`${e.pkTable}.${e.pkCol}`);
  }
  if (hoveredField) {
    // Find all edges connected to this field
    for (const edge of edges) {
      if (`${edge.fkTable}.${edge.fkCol}` === hoveredField || `${edge.pkTable}.${edge.pkCol}` === hoveredField) {
        highlightedFields.add(`${edge.fkTable}.${edge.fkCol}`);
        highlightedFields.add(`${edge.pkTable}.${edge.pkCol}`);
      }
    }
  }

  const handleTableDragStart = useCallback((tableId: string, e: React.MouseEvent) => {
    const pos = tablePositions[tableId];
    if (!pos) return;
    draggingRef.current = { id: tableId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const handleMouseMove = (ev: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      setTablePositions((prev) => ({
        ...prev,
        [drag.id]: {
          x: drag.origX + (ev.clientX - drag.startX) / zoom,
          y: drag.origY + (ev.clientY - drag.startY) / zoom,
        },
      }));
    };
    const handleMouseUp = () => { draggingRef.current = null; document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [zoom, tablePositions]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("diagram-bg")) return;
    panningRef.current = { startX: e.clientX, startY: e.clientY, origPanX: pan.x, origPanY: pan.y };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!panningRef.current) return;
      setPan({ x: panningRef.current.origPanX + (ev.clientX - panningRef.current.startX), y: panningRef.current.origPanY + (ev.clientY - panningRef.current.startY) });
    };
    const handleMouseUp = () => { panningRef.current = null; document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [pan]);

  if (!schema || schema.tables.length === 0) return null;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#0d1117]">
      <style>{`
        .dark .diagram-bg{background-color:#0d1117;background-image:radial-gradient(circle,#21262d 1px,transparent 1px);background-size:24px 24px}
        .edge-path{transition:stroke 0.15s, stroke-width 0.15s, opacity 0.15s}
        .edge-hit{cursor:pointer}
      `}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-[#21262d] px-3 py-1.5 bg-gray-50 dark:bg-[#161b22]">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">ER Diagram</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {schema.tables.length} tables &bull; {schema.relationships.length} relationships
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-gray-300"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-[36px] text-center text-[10px] tabular-nums text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-gray-300"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-gray-300"><Maximize2 className="h-3.5 w-3.5" /></button>
          <button onClick={onClose} className="ml-2 rounded px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-[#21262d] dark:hover:text-gray-300">✕ Close</button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="diagram-bg relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ backgroundColor: "#f8f9fa", backgroundImage: "radial-gradient(circle, #d0d5dd 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        onMouseDown={handleCanvasMouseDown}
      >
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {/* SVG overlay */}
          <svg width={5000} height={5000} style={{ position: "absolute", top: 0, left: 0, zIndex: 5 }}>
            <defs>
              <marker id="arrow" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 1 L 10 5 L 0 9 Z" fill="#60a5fa" />
              </marker>
              <marker id="arrow-active" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 1 L 10 5 L 0 9 Z" fill="#2563eb" />
              </marker>
            </defs>

            {edges.map((edge, i) => {
              const isActive = hoveredEdge === i ||
                `${edge.fkTable}.${edge.fkCol}` === hoveredField ||
                `${edge.pkTable}.${edge.pkCol}` === hoveredField;
              const d = edgePath(edge.x1, edge.y1, edge.x2, edge.y2);

              return (
                <g key={i}>
                  {/* Invisible wide hit area for hover detection */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="edge-hit"
                    onMouseEnter={() => setHoveredEdge(i)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    style={{ pointerEvents: "stroke" }}
                  />
                  {/* Shadow */}
                  <path
                    d={d}
                    fill="none"
                    stroke={isActive ? "rgba(37,99,235,0.2)" : "rgba(96,165,250,0.15)"}
                    strokeWidth={isActive ? 8 : 5}
                    strokeLinecap="round"
                    className="edge-path"
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Main line */}
                  <path
                    d={d}
                    fill="none"
                    stroke={isActive ? "#2563eb" : "#60a5fa"}
                    strokeWidth={isActive ? 2.5 : 2}
                    strokeDasharray={isActive ? "none" : "6 3"}
                    strokeLinecap="round"
                    markerEnd={isActive ? "url(#arrow-active)" : "url(#arrow)"}
                    className="edge-path"
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Label — only visible on hover, auto-width */}
                  {isActive && (() => {
                    const midX = (edge.x1 + edge.x2) / 2;
                    const midY = (edge.y1 + edge.y2) / 2;
                    // Approximate text width: ~5.5px per char at fontSize 9 monospace
                    const textW = Math.min(edge.label.length * 5.5 + 14, 240);
                    return (
                      <g style={{ pointerEvents: "none" }}>
                        <rect
                          x={midX - textW / 2}
                          y={midY - 11}
                          width={textW}
                          height={20}
                          rx={4}
                          fill="#1e293b"
                          opacity={0.92}
                        />
                        <text
                          x={midX}
                          y={midY + 3}
                          textAnchor="middle"
                          fill="#e2e8f0"
                          fontSize={9}
                          fontFamily="monospace"
                        >
                          {edge.label.length > 40 ? edge.label.slice(0, 38) + "…" : edge.label}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          {/* Table boxes */}
          {schema.tables.map((table) => (
            <TableBox
              key={table.name}
              table={table}
              tableId={table.name}
              position={tablePositions[table.name] ?? { x: 0, y: 0 }}
              onDragStart={handleTableDragStart}
              onMouseDown={(e) => e.stopPropagation()}
              highlightedFields={highlightedFields}
              onFieldHover={setHoveredField}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
