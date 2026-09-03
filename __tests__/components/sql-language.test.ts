import { describe, it, expect, vi } from "vitest";
import {
  SQL_LANGUAGE_ID,
  SQL_KEYWORDS,
  registerSqlLanguage,
} from "@/components/playground/sql-language";

function createMockMonaco() {
  return {
    languages: {
      register: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
    },
  };
}

describe("SQL editor language", () => {
  it("uses a dedicated language id", () => {
    expect(SQL_LANGUAGE_ID).toBe("dbfly-sql");
  });

  it("includes every JOIN-related keyword", () => {
    for (const kw of [
      "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS",
      "NATURAL", "SEMI", "ANTI", "ASOF", "ON", "USING",
    ]) {
      expect(SQL_KEYWORDS).toContain(kw);
    }
  });

  it("includes the core SQL keyword set", () => {
    for (const kw of [
      "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "GROUP", "BY",
      "HAVING", "ORDER", "LIMIT", "UNION", "WITH", "CASE", "WHEN",
    ]) {
      expect(SQL_KEYWORDS).toContain(kw);
    }
  });

  it("includes DuckDB-specific keywords", () => {
    for (const kw of [
      "QUALIFY", "SAMPLE", "WINDOW", "OVER", "PARTITION", "ILIKE",
      "HUGEINT", "TIMESTAMPTZ", "ASOF",
    ]) {
      expect(SQL_KEYWORDS).toContain(kw);
    }
  });

  it("registers the language, config and tokenizer via monaco", () => {
    const monaco = createMockMonaco();
    registerSqlLanguage(monaco);

    expect(monaco.languages.register).toHaveBeenCalledWith({
      id: "dbfly-sql",
    });
    const [confId, conf] =
      monaco.languages.setLanguageConfiguration.mock.calls[0];
    expect(confId).toBe("dbfly-sql");
    expect(conf.comments.lineComment).toBe("--");
    expect(conf.comments.blockComment).toEqual(["/*", "*/"]);
    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledTimes(1);
    const [id, monarch] =
      monaco.languages.setMonarchTokensProvider.mock.calls[0];
    expect(id).toBe("dbfly-sql");
    expect(monarch.keywords).toBe(SQL_KEYWORDS);
    expect(monarch.ignoreCase).toBe(true);
    expect(Array.isArray(monarch.tokenizer.root)).toBe(true);
    expect(monarch.tokenizer.root.length).toBeGreaterThan(0);
    // Every keyword is routed to the "keyword" token that the editor themes style.
    const wordRule: any = monarch.tokenizer.root.find(
      (r: any) => Array.isArray(r) && r[1]?.cases
    );
    expect(wordRule).toBeDefined();
    expect(wordRule[1].cases["@keywords"]).toBe("keyword");
  });

  it("colors quoted identifiers as identifiers, strings as strings", () => {
    const monaco = createMockMonaco();
    registerSqlLanguage(monaco);
    const [id, monarch] =
      monaco.languages.setMonarchTokensProvider.mock.calls[0];
    expect(id).toBe("dbfly-sql");
    const root: any[] = monarch.tokenizer.root;
    const hasStringState = root.some(
      (r: any) => r[0]?.toString?.().includes("string")
    );
    const hasIdentifierQuote = root.some((r: any) =>
      r[0]?.toString?.().includes("identifier")
    );
    expect(hasStringState || monarch.tokenizer.string).toBeTruthy();
    expect(monarch.tokenizer.string).toBeTruthy();
    expect(hasIdentifierQuote || monarch.tokenizer.quotedIdentifier).toBeTruthy();
    expect(monarch.tokenizer.quotedIdentifier).toBeTruthy();
  });
});
