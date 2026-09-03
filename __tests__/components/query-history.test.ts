import { describe, it, expect, beforeEach, vi } from "vitest";
import { addToHistory, type HistoryEntry } from "@/components/playground/query-history";

const STORAGE_KEY = "dbfly-query-history";

// Helper to read history directly from localStorage
function readHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

describe("Query History", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("addToHistory", () => {
    it("adds a query to history", () => {
      addToHistory("SELECT 1");
      const history = readHistory();
      expect(history).toHaveLength(1);
      expect(history[0].sql).toBe("SELECT 1");
      expect(history[0].id).toBeTruthy();
      expect(history[0].timestamp).toBeGreaterThan(0);
    });

    it("does not add empty query", () => {
      addToHistory("");
      addToHistory("   ");
      const history = readHistory();
      expect(history).toHaveLength(0);
    });

    it("trims whitespace from query", () => {
      addToHistory("  SELECT 1  ");
      const history = readHistory();
      expect(history[0].sql).toBe("SELECT 1");
    });

    it("adds multiple queries", () => {
      addToHistory("SELECT 1");
      addToHistory("SELECT 2");
      addToHistory("SELECT 3");
      const history = readHistory();
      expect(history).toHaveLength(3);
      // Most recent first
      expect(history[0].sql).toBe("SELECT 3");
      expect(history[1].sql).toBe("SELECT 2");
      expect(history[2].sql).toBe("SELECT 1");
    });

    it("deduplicates queries and moves to front", () => {
      addToHistory("SELECT 1");
      addToHistory("SELECT 2");
      addToHistory("SELECT 1"); // Duplicate
      const history = readHistory();
      expect(history).toHaveLength(2);
      expect(history[0].sql).toBe("SELECT 1");
      expect(history[1].sql).toBe("SELECT 2");
    });

    it("respects MAX_HISTORY of 50", () => {
      for (let i = 0; i < 55; i++) {
        addToHistory(`SELECT ${i}`);
      }
      const history = readHistory();
      expect(history).toHaveLength(50);
      // Most recent should be at top
      expect(history[0].sql).toBe("SELECT 54");
    });

    it("generates unique IDs", () => {
      addToHistory("SELECT 1");
      addToHistory("SELECT 2");
      const history = readHistory();
      expect(history[0].id).not.toBe(history[1].id);
    });

    it("fires custom event after adding", () => {
      const handler = vi.fn();
      window.addEventListener("dbfly-history-updated", handler);
      addToHistory("SELECT 1");
      expect(handler).toHaveBeenCalled();
      window.removeEventListener("dbfly-history-updated", handler);
    });

    it("deduplicates with different whitespace", () => {
      addToHistory("SELECT 1");
      addToHistory("SELECT 1  "); // Trailing space → same after trim
      const history = readHistory();
      expect(history).toHaveLength(1);
    });
  });

  describe("localStorage persistence", () => {
    it("persists history across calls", () => {
      addToHistory("SELECT 1");
      addToHistory("SELECT 2");
      const history = readHistory();
      expect(history).toHaveLength(2);
    });

    it("uses correct storage key", () => {
      addToHistory("SELECT 1");
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });
  });

  describe("HistoryEntry structure", () => {
    it("has correct fields", () => {
      addToHistory("SELECT 42");
      const history = readHistory();
      const entry = history[0];
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("sql");
      expect(entry).toHaveProperty("timestamp");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.sql).toBe("string");
      expect(typeof entry.timestamp).toBe("number");
    });
  });
});
