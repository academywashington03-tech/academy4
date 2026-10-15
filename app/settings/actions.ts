"use server";
import { redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/validation";

export async function updateProfile(form: FormData) {
  const s = await requirePath("/settings");
  const name = String(form.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (name.length < 3 || name.length > 100) redirect("/settings?error=name");
  if (!phone) redirect("/settings?error=phone");
  // Only these two columns are ever written; role/suspended are protected by a DB trigger as well.
  const { error } = await (await createClient()).from("profiles").update({ full_name: name, phone, notify_email: form.get("notify_email") === "on" }).eq("id", s.id);
  if (error) redirect("/settings?error=failed");
  redirect("/settings?ok=1");
}
