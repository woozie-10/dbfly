"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Suppresses hydration mismatches caused by browser extensions
 * that inject attributes into the DOM before React hydrates.
 */
export function HydrationGuard({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading DBFly...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
