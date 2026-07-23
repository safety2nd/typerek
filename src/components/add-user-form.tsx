"use client";

import { useState, useTransition } from "react";

export function AddUserForm() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const form = new FormData(e.target as HTMLFormElement);
    startTransition(async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Nie udało się");
        return;
      }
      setMsg(`Dodano ${body.username}`);
      (e.target as HTMLFormElement).reset();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
      <div>
        <label className="block text-xs mb-1">Nazwa użytkownika</label>
        <input
          name="username"
          required
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">Hasło</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground text-background px-3 py-1 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Dodaj użytkownika"}
      </button>
      {msg ? <span className="text-sm text-green-500">{msg}</span> : null}
      {err ? <span className="text-sm text-red-500">{err}</span> : null}
    </form>
  );
}