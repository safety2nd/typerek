"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function MatchdaySelect({
  matchdays,
  selected,
}: {
  matchdays: { matchday: number; label: string }[];
  selected: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set("kolecka", value);
    } else {
      next.delete("kolecka");
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500">Kolejka:</span>
      <select
        value={selected ?? ""}
        onChange={onChange}
        className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
      >
        {matchdays.map((m) => (
          <option key={m.matchday} value={m.matchday}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}