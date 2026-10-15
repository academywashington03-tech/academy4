import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePath, type SessionProfile } from "./auth";
import { createClient } from "./supabase/server";
import { UUID_RE } from "./course-validation";

export const fstr = (f: FormData, k: string) => String(f.get(k) ?? "");
export const fid = (f: FormData, k: string) => { const v = fstr(f, k); if (!UUID_RE.test(v)) redirect("/admin?error=bad_request"); return v; };
export function go(path: string, key: "ok" | "error", code: string): never { return redirect(`${path}?${key}=${code}`); }

/** Server-side gate for admin-only actions: re-reads the role from the DB, then returns a user-scoped client (RLS applies). */
export async function adminCtx(path: string): Promise<{ s: SessionProfile; sb: SupabaseClient }> {
  const s = await requirePath(path);
  if (s.role !== "super_admin") redirect("/forbidden");
  return { s, sb: await createClient() };
}
export async function audit(sb: SupabaseClient, action: string, entity: string, entityId: string, details?: object) {
  await sb.rpc("log_audit", { p_action: action, p_entity: entity, p_entity_id: entityId, p_details: details ?? null });
}
