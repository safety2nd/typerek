import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const headerList = await headers();
    const ip = headerList.get("x-forwarded-for") ?? headerList.get("x-real-ip") ?? null;
    const ua = headerList.get("user-agent") ?? null;
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    await service.from("auth_log").insert({
      user_id: user.id,
      username: profile?.username ?? null,
      event: "LOGOUT",
      ip_address: ip,
      user_agent: ua,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}