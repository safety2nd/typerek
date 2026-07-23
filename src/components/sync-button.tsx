"use client";

import { useState, useTransition } from "react";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function sync() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Synchronizacja nieudana");
        return;
      }
      setMsg(`Zsynchronizowano ${body.count ?? 0} meczów`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sync}
        disabled={pending}
        className="rounded bg-foreground text-background px-3 py-1 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Synchronizacja…" : "Synchronizuj teraz"}
      </button>
      {msg ? <span className="text-sm text-green-500">{msg}</span> : null}
      {err ? <span className="text-sm text-red-500">{err}</span> : null}
    </div>
  );
}