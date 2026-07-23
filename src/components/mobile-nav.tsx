"use client";

import { useState } from "react";

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-9 h-9 rounded border border-zinc-300 dark:border-zinc-700"
        aria-label="Menu"
      >
        <span className="text-lg">{open ? "✕" : "☰"}</span>
      </button>
      {open ? (
        <div className="absolute top-14 left-0 right-0 bg-background border-b border-zinc-200 dark:border-zinc-800 px-4 py-4 flex flex-col gap-3 text-sm">
          {children}
        </div>
      ) : null}
    </>
  );
}