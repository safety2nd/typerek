import { requireAdmin } from "@/lib/auth";
import { getUsers } from "@/lib/queries";
import { AddUserForm } from "@/components/add-user-form";
import { UserList } from "@/components/user-list";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await getUsers();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Użytkownicy</h1>
      <AddUserForm />
      <UserList users={users} />
    </div>
  );
}