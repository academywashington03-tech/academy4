"use server";
import { adminCtx, audit, fid, fstr, go } from "@/lib/admin-helpers";

export async function revokeCertificate(form: FormData) {
  const { sb } = await adminCtx("/admin/certificates");
  const { error } = await sb.rpc("revoke_certificate", { p_id: fid(form, "id"), p_reason: fstr(form, "reason") });
  if (error) go("/admin/certificates", "error", "failed");
  go("/admin/certificates", "ok", "cert_revoked");
}

export async function saveCertificateSettings(form: FormData) {
  const { sb } = await adminCtx("/admin/settings");
  const value = { signatory_name: fstr(form, "signatory_name").trim().slice(0, 100), signatory_title: fstr(form, "signatory_title").trim().slice(0, 100) };
  const { error } = await sb.from("settings").upsert({ key: "public.certificate", value });
  if (error) go("/admin/settings", "error", "failed");
  await audit(sb, "settings_changed", "settings", "public.certificate");
  go("/admin/settings", "ok", "saved");
}
