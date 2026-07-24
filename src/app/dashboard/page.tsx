import { requireProfile } from "@/lib/auth";
import { getFixturesWithAllPredictions } from "@/lib/queries";
import type { FixtureWithPredictions } from "@/lib/queries";

export default async function DashboardPage() {
  await requireProfile();
  const fixtures = await getFixturesWithAllPredictions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tablica typów</h1>
      {fixtures.length === 0 ? (
        <p className="text-zinc-500">Brak meczów.</p>
      ) : (
        <div className="grid gap-4">
          {fixtures.map((f) => (
            <FixtureCard key={f.id} fixture={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FixtureCard({ fixture }: { fixture: FixtureWithPredictions }) {
  const finished = fixture.status === "FINISHED";
  const result =
    finished && fixture.home_score != null && fixture.away_score != null
      ? `${fixture.home_score}:${fixture.away_score}`
      : null;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-semibold">{fixture.home_team}</span>
          <span className="text-zinc-400 mx-2">v</span>
          <span className="font-semibold">{fixture.away_team}</span>
        </div>
        <div className="text-xs text-zinc-500">
          {fixture.matchday_name ?? `Kolejka ${fixture.matchday ?? ""}`}
          {result ? <span className="ml-2 font-mono text-foreground">{result}</span> : null}
        </div>
      </div>
      {fixture.predictions.length === 0 ? (
        <p className="text-sm text-zinc-500">Brak typów</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fixture.predictions.map((p) => (
            <div
              key={p.username}
              className={`rounded px-3 py-1.5 text-sm font-mono ${
                finished
                  ? p.points === 3
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : p.points != null && p.points >= 1
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-900"
              }`}
            >
              <span className="font-sans mr-2">{p.username}</span>
              {p.home_score}:{p.away_score}
              {finished ? <span className="ml-2 text-xs">+{p.points ?? 0}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}