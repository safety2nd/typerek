import { requireProfile } from "@/lib/auth";
import { getLeaderboard } from "@/lib/queries";

export default async function StandingsPage() {
  await requireProfile();
  const rows = await getLeaderboard();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tabela</h1>
      {rows.length === 0 ? (
        <p className="text-zinc-500">Brak punktowanych typów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Gracz</th>
                <th className="py-2 pr-4 text-right">Punkty</th>
                <th className="py-2 pr-4 text-right">Dokładnie</th>
                <th className="py-2 pr-4 text-right">Wynik</th>
                <th className="py-2 pr-4 text-right">Typy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 font-mono">{i + 1}</td>
                  <td className="py-2 pr-4 font-medium">{r.username}</td>
                  <td className="py-2 pr-4 text-right font-bold">{r.total_points}</td>
                  <td className="py-2 pr-4 text-right">{r.exact_hits}</td>
                  <td className="py-2 pr-4 text-right">{r.outcome_hits}</td>
                  <td className="py-2 pr-4 text-right text-zinc-500">{r.total_predictions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}