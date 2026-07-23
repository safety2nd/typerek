import Link from "next/link";
import { getCurrentUser, getProfile } from "@/lib/auth";

export async function NavBar() {
  const user = await getCurrentUser();
  const profile = user ? await getProfile() : null;

  return (
    <header className="w-full border-b border-zinc-200 dark:border-zinc-800">
      <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold tracking-tight">
          Liga Garażowa imienia Marka Anchimiuka
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/" className="hover:underline">
                Typuj
              </Link>
              <Link href="/standings" className="hover:underline">
                Tabela
              </Link>
              <Link href="/predictions" className="hover:underline">
                Wszystkie typy
              </Link>
              {profile?.is_admin ? (
                <Link href="/admin" className="hover:underline text-amber-500">
                  Admin
                </Link>
              ) : null}
              <form action="/auth/signout" method="post">
                <button className="hover:underline" type="submit">
                  Wyloguj
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="hover:underline">
              Zaloguj
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}