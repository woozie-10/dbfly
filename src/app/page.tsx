"use client";

import dynamic from "next/dynamic";
import { HydrationGuard } from "@/components/hydration-guard";

const SqlPlayground = dynamic(
  () =>
    import("@/components/playground/sql-playground").then(
      (mod) => mod.SqlPlayground
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading DBFly...</p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return (
    <HydrationGuard>
      <SqlPlayground />
    </HydrationGuard>
  );
}
