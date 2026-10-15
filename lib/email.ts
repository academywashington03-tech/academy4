import "server-only";

export type SendResult = { ok: boolean; reason?: "not_configured" | "rate_limited" | "failed" };

/** Sends through Resend's HTTP API. If the service is not configured or is down, the platform keeps working. */
export async function sendEmail(o: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.EMAIL_PROVIDER_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [o.to], subject: o.subject, html: o.html, text: o.text }),
      signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: res.status === 429 ? "rate_limited" : "failed" };
  } catch { return { ok: false, reason: "failed" }; }
}
