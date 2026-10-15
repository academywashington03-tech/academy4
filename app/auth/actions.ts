"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import { allow } from "@/lib/ratelimit";
import { buildSignupMetadata, isStrongPassword, safeNext, validateRegister } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);

export async function register(form: FormData) {
  if (!isSupabaseConfigured()) back("/register", { error: "failed" });
  if (!(await allow("register", 8, 3600))) back("/register", { error: "rate" });
  // Friendly message; Supabase hides the trigger's error text, so check the setting first (the DB trigger still blocks bypasses).
  const { data: st } = await (await createClient()).from("settings").select("value").eq("key", "public.academy").maybeSingle();
  if ((st?.value as { registration_open?: boolean } | undefined)?.registration_open === false) back("/register", { error: "closed" });
  const v = validateRegister({ fullName: str(form, "fullName"), email: str(form, "email"), phone: str(form, "phone"), password: str(form, "password") });
  if (!v.ok) back("/register", { error: Object.values(v.errors)[0]! });
  const c = v.clean!;
  const sb = await createClient();
  // Only name + phone go into metadata. Any "role" field in the form is ignored; the DB trigger forces 'student'.
  const { error } = await sb.auth.signUp({
    email: c.email, password: c.password,
    options: { data: buildSignupMetadata(c), emailRedirectTo: `${SITE_URL}/auth/callback?next=/dashboard` },
  });
  if (error) back("/register", { error: error.message.toLowerCase().includes("registration closed") ? "closed" : "failed" });
  back("/login", { notice: "check_email" }); // same message whether or not the email already exists
}

export async function login(form: FormData) {
  const next = safeNext(str(form, "next"));
  if (!isSupabaseConfigured()) back("/login", { error: "failed" });
  if (!(await allow("login", 20, 600, str(form, "email").trim()))) back("/login", { error: "rate", next });
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email: str(form, "email").trim().toLowerCase(), password: str(form, "password") });
  if (error) back("/login", { error: "invalid", next });
  const { data: { user } } = await sb.auth.getUser();
  const { data: p } = user ? await sb.from("profiles").select("suspended").eq("id", user.id).single() : { data: null };
  if (p?.suspended) { await sb.auth.signOut(); back("/login", { error: "suspended" }); }
  redirect(next);
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured()) back("/login", { error: "failed" });
  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${SITE_URL}/auth/callback?next=/dashboard` } });
  if (error || !data.url) back("/login", { error: "failed" });
  redirect(data.url);
}

export async function forgotPassword(form: FormData) {
  if (isSupabaseConfigured() && (await allow("forgot", 5, 3600, str(form, "email").trim()))) {   // over the limit: same reply, nothing sent
    const sb = await createClient();
    await sb.auth.resetPasswordForEmail(str(form, "email").trim().toLowerCase(), { redirectTo: `${SITE_URL}/auth/callback?next=/reset-password` });
  }
  back("/forgot-password", { notice: "reset_sent" }); // never reveal whether the email exists
}

export async function resetPassword(form: FormData) {
  const pw = str(form, "password");
  if (!isStrongPassword(pw)) back("/reset-password", { error: "password" });
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password: pw }); // requires the recovery session from the email link
  if (error) back("/reset-password", { error: "failed" });
  await sb.auth.signOut();
  back("/login", { notice: "password_updated" });
}

export async function signOut() {
  if (isSupabaseConfigured()) await (await createClient()).auth.signOut();
  redirect("/");
}
