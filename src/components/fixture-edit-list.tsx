"use client";

import { useState, useTransition } from "react";
import type { Fixture } from "@/lib/types";

export function FixtureEditList({ fixtures }: { fixtures: Fixture[] }) {
  return (
    <div className="grid gap-2">
      {fixtures.map((f) => (
        <FixtureEditRow key={f.id} fixture={f} />
      ))}
    </div>
  );
}

function FixtureEditRow({ fixture }: { fixture: Fixture }) {
  const [home, setHome] = useState(
    fixture.home_score != null ? String(fixture.home_score) : "",
  );
  const [away, setAway] = useState(
    fixture.away_score != null ? String(fixture.away_score) : "",
  );
  const [status, setStatus] = useState(fixture.status);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setMsg(null);
    setErr(null);
    const h = home === "" ? null : Number(home);
    const a = away === "" ? null : Number(away);
    startTransition(async () => {
      const res = await fetch(`/api/admin/fixtures/${fixture.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_score: h, away_score: a, status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Nie udało się");
        return;
      }
      setMsg("zapisano");
      setTimeout(() => setMsg(null), 2000);
    });
  }

  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 flex flex-wrap items-center gap-3 text-sm">
      <div className="text-xs text-zinc-500 w-32">
        {new Date(fixture.utc_date).toLocaleDateString("pl-PL")}
      </div>
      <div className="flex-1 font-medium">
        {fixture.home_team} v {fixture.away_team}
      </div>
      <input
        aria-label="wynik gospodarzy"
        type="number"
        min={0}
        value={home}
        onChange={(e) => setHome(e.target.value)}
        placeholder="G"
        className="w-14 text-center rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 font-mono"
      />
      <input
        aria-label="wynik gości"
        type="number"
        min={0}
        value={away}
        onChange={(e) => setAway(e.target.value)}
        placeholder="G"
        className="w-14 text-center rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 font-mono"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as Fixture["status"])}
        className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
      >
        <option value="SCHEDULED">Zaplanowany</option>
        <option value="IN_PLAY">W trakcie</option>
        <option value="FINISHED">Zakończony</option>
      </select>
      <button
        onClick={save}
        disabled={pending}
        className="rounded bg-foreground text-background px-3 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Zapisz"}
      </button>
      {msg ? <span className="text-xs text-green-500">{msg}</span> : null}
      {err ? <span className="text-xs text-red-500">{err}</span> : null}
    </div>
  );
}