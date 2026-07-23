import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getEmailForUsername } from "@/lib/queries";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

async function logAuthEvent(
  event: "LOGIN" | "LOGIN_FAILED" | "LOGOUT",
  username: string | null,
  userId: string | null,
) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for") ?? headerList.get("x-real-ip") ?? null;
  const ua = headerList.get("user-agent") ?? null;
  const service = createServiceClient();
  await service.from("auth_log").insert({
    user_id: userId,
    username,
    event,
    ip_address: ip,
    user_agent: ua,
  });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!username || !password) {
      redirect(`/login?error=${encodeURIComponent("Podaj nazwę i hasło")}`);
    }

    const email = await getEmailForUsername(username);
    if (!email) {
      await logAuthEvent("LOGIN_FAILED", username, null);
      redirect(`/login?error=${encodeURIComponent("Nieprawidłowe dane logowania")}`);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      await logAuthEvent("LOGIN_FAILED", username, null);
      redirect(`/login?error=${encodeURIComponent("Nieprawidłowe dane logowania")}`);
    }

    await logAuthEvent("LOGIN", username, data.user.id);
    redirect("/");
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Liga Garażowa imienia Marka Anchimiuka</h1>
      <form action={signIn} className="flex flex-col gap-4">
        <div>
          <label htmlFor="username" className="block text-sm mb-1">
            Nazwa użytkownika
          </label>
          <input
            id="username"
            name="username"
            required
            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm mb-1">
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          />
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          className="rounded bg-foreground text-background px-4 py-2 font-medium hover:opacity-90"
        >
          Zaloguj się
        </button>
      </form>
      <p className="text-xs text-zinc-500 mt-6 text-center">
        O konto poproś administratora.
      </p>
    </div>
  );
}