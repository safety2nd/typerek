import { requireProfile } from "@/lib/auth";
import {
  getPlayerStats,
  getFixtureStats,
  getMatchdayPoints,
  getScoreDistribution,
} from "@/lib/stats";
import {
  PointsBarChart,
  AccuracyChart,
  PointsOverTimeChart,
  ScoreDistributionChart,
  PlayerRadar,
} from "@/components/stats-charts";

export default async function StatsPage() {
  await requireProfile();
  const [playerStats, fixtureStats, matchdayPoints, scoreDist] = await Promise.all([
    getPlayerStats(),
    getFixtureStats(),
    getMatchdayPoints(),
    getScoreDistribution(),
  ]);

  const upsets = fixtureStats.filter((f) => f.upset);
  const consensusRate = fixtureStats.length > 0
    ? Math.round(
        (fixtureStats.filter((f) => f.consensus_correct === true).length /
          fixtureStats.filter((f) => f.consensus_correct !== null).length || 0) * 100,
      )
    : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Statystyki</h1>

      {playerStats.length === 0 ? (
        <p className="text-zinc-500">Brak zakończonych meczów do analizy.</p>
      ) : (
        <>
          {/* Player profiling */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Profil graczy</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <h3 className="text-sm font-medium mb-3">Rozkład punktów</h3>
                <PointsBarChart stats={playerStats} />
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <h3 className="text-sm font-medium mb-3">Dokładność i bias domowy</h3>
                <AccuracyChart stats={playerStats} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="py-2 pr-4">Gracz</th>
                    <th className="py-2 pr-4 text-right">Punkty</th>
                    <th className="py-2 pr-4 text-right">Dokładnie</th>
                    <th className="py-2 pr-4 text-right">Wynik</th>
                    <th className="py-2 pr-4 text-right">Pudła</th>
                    <th className="py-2 pr-4 text-right">Dokładność</th>
                    <th className="py-2 pr-4 text-right">Śr. bramek</th>
                    <th className="py-2 pr-4 text-right">Bias dom</th>
                  </tr>
                </thead>
                <tbody>
                  {playerStats.map((s) => (
                    <tr key={s.username} className="border-b border-zinc-100 dark:border-zinc-900">
                      <td className="py-2 pr-4 font-medium">{s.username}</td>
                      <td className="py-2 pr-4 text-right font-bold">{s.total_points}</td>
                      <td className="py-2 pr-4 text-right text-green-500">{s.exact_hits}</td>
                      <td className="py-2 pr-4 text-right text-amber-500">{s.outcome_hits}</td>
                      <td className="py-2 pr-4 text-right text-zinc-500">{s.zero_hits}</td>
                      <td className="py-2 pr-4 text-right">{s.accuracy}%</td>
                      <td className="py-2 pr-4 text-right">{s.avg_predicted_goals}</td>
                      <td className="py-2 pr-4 text-right">{s.home_win_bias}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Season trends */}
          {matchdayPoints.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Trendy sezonu</h2>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <h3 className="text-sm font-medium mb-3">Punkty w czasie (skumulowane)</h3>
                <PointsOverTimeChart data={matchdayPoints} />
              </div>
            </section>
          ) : null}

          {/* Prediction accuracy */}
          {scoreDist.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Rozkład wyników</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <h3 className="text-sm font-medium mb-3">Typy vs wyniki</h3>
                  <ScoreDistributionChart data={scoreDist} />
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <h3 className="text-sm font-medium mb-3">Radar dokładności</h3>
                  <PlayerRadar stats={playerStats} />
                </div>
              </div>
            </section>
          ) : null}

          {/* Fixture analytics */}
          {fixtureStats.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Analiza meczów</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="text-2xl font-bold">{consensusRate}%</div>
                  <div className="text-sm text-zinc-500">Skuteczność konsensusu</div>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="text-2xl font-bold">{upsets.length}</div>
                  <div className="text-sm text-zinc-500">Niespodzianek</div>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                  <div className="text-2xl font-bold">{fixtureStats.length}</div>
                  <div className="text-sm text-zinc-500">Meczów z typami</div>
                </div>
              </div>
              {upsets.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Niespodzianki</h3>
                  {upsets.map((f) => (
                    <div key={f.fixture_id} className="text-sm flex items-center gap-2">
                      <span className="text-red-500">⚡</span>
                      <span>{f.home_team} v {f.away_team}</span>
                      <span className="text-zinc-500">
                        konsensus: {f.consensus_home}-{f.consensus_away},
                        wynik: {f.home_score}-{f.away_score}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}