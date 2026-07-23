"use client";

import { useState, useTransition } from "react";
import { EKSTRAKLASA_TEAMS } from "@/lib/teams";

export function AddFixtureForm({ onAdded }: { onAdded?: () => void }) {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [round, setRound] = useState("1");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!homeTeam || !awayTeam || !date || !time) {
      setErr("Wypełnij wszystkie pola");
      return;
    }
    if (homeTeam === awayTeam) {
      setErr("Gospodarz i gość muszą być różni");
      return;
    }
    const utc = new Date(`${date}T${time}:00`).toISOString();
    startTransition(async () => {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_team: homeTeam,
          away_team: awayTeam,
          utc_date: utc,
          matchday: Number(round) || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error ?? "Nie udało się");
        return;
      }
      setMsg(`Dodano: ${homeTeam} v ${awayTeam}`);
      setAwayTeam("");
      onAdded?.();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
      <div>
        <label className="block text-xs mb-1">Gospodarz</label>
        <select
          value={homeTeam}
          onChange={(e) => setHomeTeam(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 w-48"
        >
          <option value="">— wybierz —</option>
          {EKSTRAKLASA_TEAMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">Gość</label>
        <select
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 w-48"
        >
          <option value="">— wybierz —</option>
          {EKSTRAKLASA_TEAMS.filter((t) => t !== homeTeam).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">Godzina</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">Kolejka</label>
        <input
          type="number"
          min={1}
          value={round}
          onChange={(e) => setRound(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 w-16"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground text-background px-3 py-1 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "…" : "Dodaj mecz"}
      </button>
      {msg ? <span className="text-sm text-green-500">{msg}</span> : null}
      {err ? <span className="text-sm text-red-500">{err}</span> : null}
    </form>
  );
}