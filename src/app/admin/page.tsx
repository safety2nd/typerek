import { requireAdmin } from "@/lib/auth";
import Link from "next/link";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/users"
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          <div className="font-semibold">Użytkownicy</div>
          <div className="text-sm text-zinc-500">Dodaj lub zarządzaj kontami kumpli.</div>
        </Link>
        <Link
          href="/admin/fixtures"
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          <div className="font-semibold">Mecze i wyniki</div>
          <div className="text-sm text-zinc-500">Dodawaj mecze i edytuj wyniki.</div>
        </Link>
      </div>
    </div>
  );
}