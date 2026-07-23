"use client";

import { useState, useTransition } from "react";

interface UserRow {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export function UserList({ users }: { users: UserRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2 pr-4">Nazwa</th>
            <th className="py-2 pr-4">Admin?</th>
            <th className="py-2 pr-4">Utworzono</th>
            <th className="py-2 pr-4">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserListRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserListRow({ user }: { user: UserRow }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleAdmin() {
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: !user.is_admin }),
      });
      if (!res.ok) setErr("Nie udało się");
    });
  }

  function remove() {
    if (!confirm(`Usunąć ${user.username}? To usunie też jego typy.`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) setErr("Nie udało się");
    });
  }

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-900">
      <td className="py-2 pr-4 font-medium">{user.username}</td>
      <td className="py-2 pr-4">{user.is_admin ? "tak" : "nie"}</td>
      <td className="py-2 pr-4 text-zinc-500">
        {new Date(user.created_at).toLocaleDateString("pl-PL")}
      </td>
      <td className="py-2 pr-4 flex gap-2">
        <button
          onClick={toggleAdmin}
          disabled={pending}
          className="text-xs rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          {user.is_admin ? "Odbierz admina" : "Zrób adminem"}
        </button>
        <button
          onClick={remove}
          disabled={pending}
          className="text-xs rounded border border-red-300 text-red-500 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950"
        >
          Usuń
        </button>
        {err ? <span className="text-xs text-red-500">{err}</span> : null}
      </td>
    </tr>
  );
}