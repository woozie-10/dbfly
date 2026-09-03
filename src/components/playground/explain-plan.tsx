"use client";

import { useMemo } from "react";
import { Clock, Database, ArrowRight, Zap } from "lucide-react";

interface ExplainPlanProps {
  plan: string[];
  executionTimeMs: number;
  isAnalyze?: boolean;
}

interface PlanNode {
  depth: number;
  text: string;
  icon?: "scan" | "join" | "hash" | "sort" | "aggregate" | "filter" | "default";
}

const NODE_ICONS: Record<string, PlanNode["icon"]> = {
  "SEQ SCAN": "scan",
  "INDEX SCAN": "scan",
  "PARQUET SCAN": "scan",
  "CSV READER": "scan",
  "HASH JOIN": "hash",
  "NESTED LOOP": "join",
  "MERGE JOIN": "join",
  "CROSS JOIN": "join",
  "ORDER BY": "sort",
  "SORT": "sort",
  "HASH GROUP": "aggregate",
  "HASH AGGREGATE": "aggregate",
  "FILTER": "filter",
};

function classifyNode(line: string): PlanNode["icon"] {
  const upper = line.toUpperCase();
  for (const [keyword, icon] of Object.entries(NODE_ICONS)) {
    if (upper.includes(keyword)) return icon;
  }
  return "default";
}

const ICON_COLORS: Record<string, string> = {
  scan: "text-blue-500 dark:text-blue-400",
  join: "text-purple-500 dark:text-purple-400",
  hash: "text-amber-500 dark:text-amber-400",
  sort: "text-green-500 dark:text-green-400",
  aggregate: "text-red-500 dark:text-red-400",
  filter: "text-orange-500 dark:text-orange-400",
  default: "text-gray-400 dark:text-gray-500",
};

function getCostEstimate(line: string): string | null {
  // DuckDB often shows "cost=..." or "rows=..." in the plan
  const costMatch = line.match(/cost=([^)]+)/i);
  if (costMatch) return costMatch[1];
  const rowsMatch = line.match(/rows=(\d+)/i);
  if (rowsMatch) return `~${rowsMatch[1]} rows`;
  return null;
}

function parsePlanLine(line: string): PlanNode {
  const depthMatch = line.match(/^(\\s*)/);
  const depth = depthMatch ? Math.floor(depthMatch[1].length / 2) : 0;
  const text = line.trim();

  return {
    depth,
    text,
    icon: classifyNode(text),
  };
}

export function ExplainPlan({ plan, executionTimeMs, isAnalyze = false }: ExplainPlanProps) {
  const nodes = useMemo(() => plan.map(parsePlanLine), [plan]);

  if (plan.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-[#0d1117]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No execution plan available
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 dark:border-[#21262d] px-3 py-1.5 bg-gray-50 dark:bg-[#161b22]">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {isAnalyze ? "EXPLAIN ANALYZE" : "Execution Plan"}
        </span>
        <span className="rounded-md bg-gray-100 dark:bg-[#21262d] px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
          {executionTimeMs.toFixed(1)}ms
        </span>
        {isAnalyze && (
          <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
            Actual execution
          </span>
        )}
      </div>

      {/* Plan tree */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-1">
          {nodes.map((node, i) => (
            <div
              key={i}
              className="flex items-start gap-2 font-mono text-xs leading-relaxed"
              style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
            >
              {/* Connector line */}
              {node.depth > 0 && (
                <span className="mt-0.5 text-gray-300 dark:text-gray-600">
                  ├─
                </span>
              )}

              {/* Icon */}
              <span className={`mt-0.5 shrink-0 ${ICON_COLORS[node.icon ?? "default"]}`}>
                {node.icon === "scan" && <Database className="h-3 w-3" />}
                {node.icon === "join" && <ArrowRight className="h-3 w-3" />}
                {node.icon === "hash" && <Zap className="h-3 w-3" />}
                {node.icon === "sort" && <ArrowRight className="h-3 w-3 rotate-90" />}
                {node.icon === "aggregate" && <ArrowRight className="h-3 w-3 rotate-180" />}
                {node.icon === "filter" && <ArrowRight className="h-3 w-3 -rotate-45" />}
                {node.icon === "default" && <Clock className="h-3 w-3" />}
              </span>

              {/* Text */}
              <span className="break-words text-gray-800 dark:text-gray-200">
                {node.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
