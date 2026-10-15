import { redirect } from "next/navigation";
import { decide, type Role } from "./authz";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";

export type SessionProfile = { id: string; email: string | undefined; fullName: string; role: Role; suspended: boolean };

/** The signed-in user + their profile, read from the DB (never from browser-supplied data). */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await sb.from("profiles").select("full_name, role, suspended").eq("id", user.id).single();
  if (!p) return null;
  return { id: user.id, email: user.email, fullName: p.full_name, role: p.role as Role, suspended: p.suspended };
}

/** Call at the top of every protected page/layout/action. */
export async function requirePath(path: string): Promise<SessionProfile> {
  const s = await getSessionProfile();
  const d = decide(s?.role ?? null, s?.suspended ?? false, path);
  if (d === "login" || !s) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (d === "forbidden") redirect("/forbidden");
  return s;
}
