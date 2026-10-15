import "server-only";
import { createServiceClient } from "./supabase/admin";
import { SITE_URL } from "./supabase/config";
import { sendEmail } from "./email";
import { renderEmail } from "./email-templates";

/** Sends queued notification emails (email_status = 'pending'). Safe to call often; each row is claimed before sending. */
export async function sendPendingEmails(limit = 25): Promise<{ configured: boolean; sent: number; failed: number }> {
  if (!process.env.EMAIL_PROVIDER_API_KEY || !process.env.EMAIL_FROM) return { configured: false, sent: 0, failed: 0 };
  const sb = createServiceClient();
  const { data } = await sb.from("notifications").select("id, title, body, link, email_attempts, profiles(email)")
    .eq("email_status", "pending").lt("email_attempts", 3).order("created_at").limit(limit);
  let sent = 0, failed = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const n of (data ?? []) as any[]) {
    const email: string | undefined = n.profiles?.email;
    if (!email) { await sb.from("notifications").update({ email_status: "skipped" }).eq("id", n.id); continue; }
    // Claim the row so two concurrent runs never send the same email twice.
    const { data: claimed } = await sb.from("notifications").update({ email_attempts: n.email_attempts + 1 })
      .eq("id", n.id).eq("email_status", "pending").eq("email_attempts", n.email_attempts).select("id");
    if (!claimed?.length) continue;
    const { html, text } = renderEmail({ siteUrl: SITE_URL, title: n.title, body: n.body ?? "", ctaLabel: n.link ? "فتح في الأكاديمية" : undefined, ctaPath: n.link });
    const r = await sendEmail({ to: email, subject: n.title, html, text });
    if (r.ok) { await sb.from("notifications").update({ email_status: "sent" }).eq("id", n.id); sent++; }
    else {
      failed++;
      if (n.email_attempts + 1 >= 3 && r.reason !== "rate_limited") await sb.from("notifications").update({ email_status: "failed" }).eq("id", n.id);
      if (r.reason === "rate_limited") break;          // provider quota reached: try again on the next run
    }
  }
  return { configured: true, sent, failed };
}
