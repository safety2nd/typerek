import { requireProfile } from "@/lib/auth";
import { getAllPredictions } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export default async function AllPredictionsPage() {
  await requireProfile();
  const rows = await getAllPredictions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wszystkie typy</h1>
      {rows.length === 0 ? (
        <p className="text-zinc-500">Brak typów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-4">Gracz</th>
                <th className="py-2 pr-4">Mecz</th>
                <th className="py-2 pr-4 text-right">Typ</th>
                <th className="py-2 pr-4 text-right">Wynik</th>
                <th className="py-2 pr-4 text-right">Pkt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 font-medium">{r.username}</td>
                  <td className="py-2 pr-4">
                    {r.home_team} v {r.away_team}
                    <div className="text-xs text-zinc-500">
                      {formatDate(r.utc_date)}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {r.home_score}-{r.away_score}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {r.status === "FINISHED"
                      ? `${r.fixture_home_score ?? 0}-${r.fixture_away_score ?? 0}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {r.points == null ? "—" : <span className="text-amber-500">{r.points}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}