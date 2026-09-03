"use client";

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import type { editor } from "monaco-editor";
import type { SchemaInfo } from "@/engine/types";
import { registerCompletionProvider } from "./sql-completion";
import { registerSqlLanguage, SQL_LANGUAGE_ID } from "./sql-language";

// Module-level guards — survive React Strict Mode double-mount / HMR.
// A ref resets on every unmount+remount, causing Monaco to accumulate
// language definitions / completion providers.
let languageRegistered = false;
let providerRegistered = false;

export interface SqlEditorHandle {
  /** Programmatically set editor content (for history / clear / load). */
  setValue: (sql: string) => void;
}

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRunQuery: () => void;
  isRunning: boolean;
  schema: SchemaInfo | null;
  fontSize?: number;
  editorRef?: React.RefObject<SqlEditorHandle | null>;
}

/**
 * The editor is **uncontrolled** — React never forces `setValue()` through
 * the render cycle. External callers push content via the imperative
 * `editorRef.setValue()` handle. This completely avoids the cursor-reset
 * bug that occurs when `value` prop changes trigger `setValue()` inside
 * `@monaco-editor/react`.
 */
export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  function SqlEditor(
    { value, onChange, onRunQuery, isRunning, schema, fontSize = 14 },
    ref
  ) {
    const { resolvedTheme } = useTheme();
    const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
    const onRunQueryRef = useRef(onRunQuery);
    const isRunningRef = useRef(isRunning);
    const schemaRef = useRef(schema);
    schemaRef.current = schema;

    useEffect(() => {
      onRunQueryRef.current = onRunQuery;
      isRunningRef.current = isRunning;
    }, [onRunQuery, isRunning]);

    // Sync Monaco theme when resolvedTheme changes
    useEffect(() => {
      if (!monacoRef.current || !editorInstanceRef.current) return;
      const theme = resolvedTheme === "dark" ? "dbfly-dark" : "dbfly-light";
      monacoRef.current.editor.setTheme(theme);
    }, [resolvedTheme]);

    // Imperative handle — parent calls this for external SQL changes
    useImperativeHandle(
      ref,
      () => ({
        setValue: (sql: string) => {
          const editor = editorInstanceRef.current;
          if (!editor) return;
          const current = editor.getValue();
          if (current !== sql) {
            editor.setValue(sql);
            // Move cursor to end after setting
            const lineCount = editor.getModel()?.getLineCount() ?? 1;
            editor.setPosition({ lineNumber: lineCount, column: (editor.getModel()?.getLineMaxColumn(lineCount) ?? 1) });
          }
        },
      }),
      []
    );

    /**
     * Runs before the editor/model is created — register our dedicated SQL
     * language here so the model is tokenized by it from the first frame.
     */
    const handleBeforeMount = useCallback((monaco: any) => {
      // Register the DuckDB SQL tokenizer language (once per page lifetime)
      if (!languageRegistered) {
        registerSqlLanguage(monaco);
        languageRegistered = true;
      }
      // Register SQL completion provider against the same language id
      if (!providerRegistered) {
        registerCompletionProvider(monaco, () => schemaRef.current, SQL_LANGUAGE_ID);
        providerRegistered = true;
      }
    }, []);

    const handleEditorMount: OnMount = (editor, monaco) => {
      editorInstanceRef.current = editor;
      monacoRef.current = monaco;

      // Register Ctrl/Cmd+Enter
      editor.addAction({
        id: "run-query",
        label: "Run Query",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          if (!isRunningRef.current) {
            onRunQueryRef.current();
          }
        },
      });

      // Custom light theme
      monaco.editor.defineTheme("dbfly-light", {
        base: "vs",
        inherit: true,
        rules: [
          { token: "keyword", foreground: "0000FF", fontStyle: "bold" },
          { token: "predefined", foreground: "0000FF" },
          { token: "string", foreground: "A31515" },
          { token: "number", foreground: "098658" },
          { token: "comment", foreground: "008000", fontStyle: "italic" },
          { token: "operator", foreground: "000000" },
          { token: "identifier", foreground: "001080" },
        ],
        colors: {
          "editor.background": "#fafafa",
          "editor.foreground": "#1a1a1a",
          "editorLineNumber.foreground": "#aaaaaa",
          "editorCursor.foreground": "#000000",
          "editor.selectionBackground": "#ADD6FF",
          "editor.lineHighlightBackground": "#f0f0f0",
          "editorGutter.background": "#fafafa",
        },
      });

      // Custom dark theme
      monaco.editor.defineTheme("dbfly-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "keyword", foreground: "ff7b72", fontStyle: "bold" },
          { token: "predefined", foreground: "79c0ff" },
          { token: "string", foreground: "a5d6ff" },
          { token: "number", foreground: "79c0ff" },
          { token: "comment", foreground: "8b949e", fontStyle: "italic" },
          { token: "operator", foreground: "ff7b72" },
          { token: "identifier", foreground: "c9d1d9" },
        ],
        colors: {
          "editor.background": "#0d1117",
          "editor.foreground": "#c9d1d9",
          "editorLineNumber.foreground": "#484f58",
          "editorCursor.foreground": "#c9d1d9",
          "editor.selectionBackground": "#264f78",
          "editor.lineHighlightBackground": "#161b22",
          "editorGutter.background": "#0d1117",
        },
      });

      const theme = resolvedTheme === "dark" ? "dbfly-dark" : "dbfly-light";
      monaco.editor.setTheme(theme);
    };

    // Update font size when prop changes
    useEffect(() => {
      if (editorInstanceRef.current) {
        editorInstanceRef.current.updateOptions({
          fontSize,
          lineHeight: Math.round(fontSize * 1.57),
        });
      }
    }, [fontSize]);

    const monacoTheme = resolvedTheme === "dark" ? "dbfly-dark" : "dbfly-light";

    return (
      <div className="h-full w-full overflow-hidden rounded-md border border-gray-200 dark:border-[#21262d]">
        <Editor
          height="100%"
          defaultLanguage={SQL_LANGUAGE_ID}
          defaultValue={value}
          beforeMount={handleBeforeMount}
          onChange={(val) => onChange(val ?? "")}
          onMount={handleEditorMount}
          theme={monacoTheme}
          options={{
            fontSize,
            lineHeight: fontSize * 1.57,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            lineNumbers: "on",
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 12,
            lineNumbersMinChars: 3,
            renderLineHighlight: "all",
            cursorWidth: 2,
            bracketPairColorization: { enabled: true },
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            suggest: {
              showKeywords: true,
              showSnippets: true,
              showFunctions: true,
              showStructs: true,
              showWords: false,
            },
          }}
          loading={
            <div className="flex h-full items-center justify-center bg-gray-100 dark:bg-[#161b22]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          }
        />
      </div>
    );
  }
);
