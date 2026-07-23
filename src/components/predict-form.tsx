"use client";

import { useState, useTransition } from "react";

export function PredictForm({
  fixtureId,
  homeTeam,
  awayTeam,
  initialHome,
  initialAway,
}: {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  initialHome?: number;
  initialAway?: number;
}) {
  const [home, setHome] = useState<string>(initialHome != null ? String(initialHome) : "");
  const [away, setAway] = useState<string>(initialAway != null ? String(initialAway) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasExisting = initialHome != null && initialAway != null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
      setError("Podaj liczby nieujemne");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture_id: fixtureId, home_score: h, away_score: a }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Nie udało się zapisać");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        aria-label={`${homeTeam} wynik`}
        name="home"
        type="number"
        min={0}
        max={30}
        inputMode="numeric"
        value={home}
        onChange={(e) => setHome(e.target.value)}
        className="w-14 text-center rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 font-mono"
        placeholder="0"
      />
      <span className="text-zinc-400">-</span>
      <input
        aria-label={`${awayTeam} wynik`}
        name="away"
        type="number"
        min={0}
        max={30}
        inputMode="numeric"
        value={away}
        onChange={(e) => setAway(e.target.value)}
        className="w-14 text-center rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 font-mono"
        placeholder="0"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground text-background px-3 py-1 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : hasExisting ? "Zmień" : "Zapisz"}
      </button>
      {saved ? <span className="text-xs text-green-500">zapisano</span> : null}
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </form>
  );
}