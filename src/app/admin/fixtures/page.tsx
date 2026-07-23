import { requireAdmin } from "@/lib/auth";
import { getFixturesForAdmin } from "@/lib/queries";
import { SyncButton } from "@/components/sync-button";
import { FixtureEditList } from "@/components/fixture-edit-list";

export default async function AdminFixturesPage() {
  await requireAdmin();
  const fixtures = await getFixturesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mecze i wyniki</h1>
        <SyncButton />
      </div>
      <p className="text-sm text-zinc-500">
        Edytuj wyniki po zakończeniu meczu — punkty przeliczają się automatycznie.
      </p>
      <FixtureEditList fixtures={fixtures} />
    </div>
  );
}