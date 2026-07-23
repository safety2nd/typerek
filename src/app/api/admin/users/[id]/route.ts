import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: { is_admin?: boolean } = {};
  if (typeof body.is_admin === "boolean") patch.is_admin = body.is_admin;

  const service = createServiceClient();

  // Prevent removing admin from yourself
  if (patch.is_admin === false && id === admin.id) {
    return NextResponse.json({ error: "Nie możesz odebrać sobie admina" }, { status: 400 });
  }

  // Prevent demoting the last admin
  if (patch.is_admin === false) {
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_admin", true);
    if (count !== null && count <= 1) {
      return NextResponse.json({ error: "Nie można odebrać admina ostatniemu administratorowi" }, { status: 400 });
    }
  }

  const { error } = await service.from("profiles").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json({ error: "Nie możesz usunąć własnego konta" }, { status: 400 });
  }

  const service = createServiceClient();

  // Prevent deleting the last admin
  const { count } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true);
  if (count !== null && count <= 1) {
    const { data: target } = await service
      .from("profiles")
      .select("is_admin")
      .eq("id", id)
      .single();
    if (target?.is_admin) {
      return NextResponse.json({ error: "Nie można usunąć ostatniego administratora" }, { status: 400 });
    }
  }

  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}