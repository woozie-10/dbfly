# DBFly

A browser-based SQL playground powered by [DuckDB-Wasm](https://duckdb.org/docs/api/wasm/overview). Write and run SQL entirely in the browser — data never leaves your machine.

## Features

- **In-memory DuckDB engine** — full SQL support, multi-statement queries, `EXPLAIN` / `EXPLAIN ANALYZE`
- **SQL editor** (Monaco) — syntax highlighting, autocomplete for keywords, functions, tables, columns and CTEs, plus snippets
- **Data import** — CSV and JSON files with automatic column type inference (INTEGER, DOUBLE, BOOLEAN, DATE, TIMESTAMP, VARCHAR, …); `NULL` values are preserved
- **Data export** — query results to CSV or JSON, or copy as TSV
- **Schema explorer** — tables, columns, primary/foreign keys and an interactive ER diagram
- **Results table** — pagination, sorting, resizable columns and faithful rendering of DuckDB types (including BIGINT/HUGEINT/DECIMAL precision)
- **Query history** — saved locally in `localStorage` (max 50 entries)
- **Themes** — light, dark and system; editor height, font size and panel widths persist between sessions

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start the development server   |
| `npm run build`     | Production build               |
| `npm start`         | Serve the production build     |
| `npm test`          | Run the Vitest suite           |
| `npm run test:watch`| Run tests in watch mode        |
| `npm run lint`      | Run ESLint                     |

## Tech stack

Next.js (App Router) · React · Tailwind CSS · DuckDB-Wasm · Monaco Editor · Radix UI · Vitest + Testing Library
