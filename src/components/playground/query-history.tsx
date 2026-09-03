"use client";

import { useState, useCallback, useEffect } from "react";
import { Clock, Trash2, X } from "lucide-react";

const STORAGE_KEY = "dbfly-query-history";
const MAX_HISTORY = 50;

export interface HistoryEntry {
  id: string;
  sql: string;
  timestamp: number;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

const HISTORY_EVENT = "dbfly-history-updated";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}

interface QueryHistoryProps {
  onSelect: (sql: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function QueryHistory({ onSelect, isOpen, onClose }: QueryHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [, setTick] = useState(0);

  // Load on mount and whenever history is updated
  useEffect(() => {
    setHistory(loadHistory());
    const handler = () => setHistory(loadHistory());
    window.addEventListener(HISTORY_EVENT, handler);
    return () => window.removeEventListener(HISTORY_EVENT, handler);
  }, []);

  // Refresh relative timestamps every 30s
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [isOpen]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="flex h-full flex-col border-r border-gray-200 bg-white dark:border-[#21262d] dark:bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-[#21262d]">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            History
          </span>
          <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-400 dark:bg-[#21262d]">
            {history.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:hover:bg-[#21262d]"
              title="Clear history"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-[#21262d]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="mb-2 h-5 w-5 text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No queries yet
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[#21262d]">
            {history.map((entry) => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                className="group w-full px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-[#161b22] cursor-pointer"
                onClick={() => onSelect(entry.sql)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(entry.sql); }}
              >
                <div className="flex items-start justify-between gap-2">
                  <pre className="max-h-16 flex-1 overflow-hidden font-mono text-[11px] leading-tight text-gray-700 dark:text-gray-300">
                    {entry.sql}
                  </pre>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEntry(entry.id);
                    }}
                    className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-gray-600"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <span className="mt-1 block text-[10px] text-gray-400 dark:text-gray-500">
                  {timeAgo(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Add a query to history. Call this after successful execution. */
export function addToHistory(sql: string) {
  const trimmed = sql.trim();
  if (!trimmed) return;

  const history = loadHistory();
  // Deduplicate: if same query exists, update timestamp
  const existing = history.findIndex((e) => e.sql.trim() === trimmed);
  if (existing >= 0) {
    history[existing].timestamp = Date.now();
    // Move to front
    const [entry] = history.splice(existing, 1);
    history.unshift(entry);
  } else {
    history.unshift({
      id: crypto.randomUUID?.() ?? String(Date.now()),
      sql: trimmed,
      timestamp: Date.now(),
    });
  }
  saveHistory(history.slice(0, MAX_HISTORY));
  // Notify any open QueryHistory component to re-read
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HISTORY_EVENT));
  }
}
