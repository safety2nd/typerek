import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export async function POST(request: Request) {
  await requireAdmin();
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || password.length < 8) {
    return NextResponse.json(
      { error: "Nieprawidłowe dane (hasło min. 8 znaków)" },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Ensure username is unique in profiles.
  const { data: existing } = await service
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ta nazwa jest już zajęta" }, { status: 409 });
  }

  const slug = slugify(username);
  const email = `${slug}@garage-league.local`;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: profileError } = await service
    .from("profiles")
    .upsert({ id: data.user.id, username, is_admin: false });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, username, id: data.user.id });
}

export async function GET() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, is_admin, created_at")
    .order("username");
  return NextResponse.json({ users: data });
}