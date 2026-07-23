import { requireAdmin } from "@/lib/auth";
import { getFixturesForAdmin } from "@/lib/queries";
import { FixtureEditList } from "@/components/fixture-edit-list";
import { AddFixtureForm } from "@/components/add-fixture-form";

export default async function AdminFixturesPage() {
  await requireAdmin();
  const fixtures = await getFixturesForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mecze i wyniki</h1>
      <p className="text-sm text-zinc-500">
        Edytuj wyniki po zakończeniu meczu — punkty przeliczają się automatycznie.
      </p>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-sm font-semibold mb-3">Dodaj mecz</h2>
        <AddFixtureForm />
      </div>
      <FixtureEditList fixtures={fixtures} />
    </div>
  );
}