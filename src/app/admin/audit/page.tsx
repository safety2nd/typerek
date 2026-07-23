import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dziennik zmian</h1>
      {rows.length === 0 ? (
        <p className="text-zinc-500">Brak zarejestrowanych zmian.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-4">Czas</th>
                <th className="py-2 pr-4">Tabela</th>
                <th className="py-2 pr-4">Akcja</th>
                <th className="py-2 pr-4">ID rekordu</th>
                <th className="py-2 pr-4">Przez</th>
                <th className="py-2 pr-4">Stare</th>
                <th className="py-2 pr-4">Nowe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: Record<string, unknown>) => (
                <tr key={r.id as number} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 text-xs text-zinc-500">
                    {new Date(r.changed_at as string).toLocaleString("pl-PL")}
                  </td>
                  <td className="py-2 pr-4">{r.table_name as string}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        r.action === "DELETE"
                          ? "text-red-500"
                          : r.action === "INSERT"
                            ? "text-green-500"
                            : "text-amber-500"
                      }
                    >
                      {r.action as string}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.record_id as string}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-500">
                    {r.changed_by ? String(r.changed_by).slice(0, 8) : "system"}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-500">
                    {r.old_values ? JSON.stringify(r.old_values) : "—"}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {r.new_values ? JSON.stringify(r.new_values) : "—"}
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