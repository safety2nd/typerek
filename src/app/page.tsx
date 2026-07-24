import { requireProfile } from "@/lib/auth";
import { getUpcomingFixtures } from "@/lib/queries";
import { PredictForm } from "@/components/predict-form";
import { canPredict } from "@/lib/scoring";
import { formatDateTime } from "@/lib/format";
import type { FixtureWithPrediction } from "@/lib/types";

export default async function Home() {
  const profile = await requireProfile();
  const fixtures = await getUpcomingFixtures(profile.id);

  const open = fixtures.filter((f) => canPredict(f));
  const locked = fixtures.filter((f) => !canPredict(f));

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-bold mb-4">Typuj nadchodzące mecze</h1>
        {open.length === 0 ? (
          <p className="text-zinc-500">Brak otwartych meczów. Sprawdź później.</p>
        ) : (
          <div className="grid gap-3">
            {open.map((f) => (
              <FixtureCard key={f.id} fixture={f} />
            ))}
          </div>
        )}
      </section>

      {locked.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold mb-3">Zablokowane / w trakcie</h2>
          <div className="grid gap-3">
            {locked.map((f) => (
              <LockedCard key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FixtureCard({ fixture }: { fixture: FixtureWithPrediction }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>{fixture.matchday_name ?? `Kolejka ${fixture.matchday ?? ""}`}</span>
        <span>{formatDateTime(fixture.utc_date)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-right font-medium">{fixture.home_team}</div>
        <PredictForm
          fixtureId={fixture.id}
          homeTeam={fixture.home_team}
          awayTeam={fixture.away_team}
          initialHome={fixture.my_prediction?.home_score}
          initialAway={fixture.my_prediction?.away_score}
        />
        <div className="flex-1 font-medium">{fixture.away_team}</div>
      </div>
    </div>
  );
}

function LockedCard({ fixture }: { fixture: FixtureWithPrediction }) {
  const pred = fixture.my_prediction;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 opacity-70">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>{fixture.matchday_name ?? `Kolejka ${fixture.matchday ?? ""}`}</span>
        <span>
          {fixture.status === "CANCELLED"
            ? "Anulowany"
            : fixture.status === "FINISHED"
              ? `PW ${fixture.home_score ?? 0}-${fixture.away_score ?? 0}`
              : formatDateTime(fixture.utc_date)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-right font-medium">{fixture.home_team}</div>
        <div className="px-3 py-1 rounded bg-zinc-100 dark:bg-zinc-900 font-mono text-sm">
          {pred ? `${pred.home_score} - ${pred.away_score}` : "—"}
          {pred && fixture.status === "FINISHED" ? (
            <span className="ml-2 text-xs text-amber-500">+{pred.points ?? 0} pkt</span>
          ) : null}
        </div>
        <div className="flex-1 font-medium">{fixture.away_team}</div>
      </div>
    </div>
  );
}