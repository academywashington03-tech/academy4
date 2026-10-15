// Pure HTML email rendering (RTL, brand colours). All dynamic text is escaped.
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderEmail(o: { siteUrl: string; title: string; body: string; ctaLabel?: string; ctaPath?: string | null; footer?: string }) {
  const site = o.siteUrl.replace(/\/+$/, "");
  const cta = o.ctaLabel && o.ctaPath && o.ctaPath.startsWith("/") && !o.ctaPath.startsWith("//") ? `${site}${o.ctaPath}` : null;
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#faf7f0;font-family:Tahoma,Arial,sans-serif;color:#1a2238">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" style="max-width:560px;background:#fdfbf6;border:1px solid #e3b95c;border-radius:8px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td align="center" style="background:#0a1530;padding:18px"><img src="${escapeHtml(site)}/brand/logo-gold-mark.png" width="56" alt="" style="display:block"><div style="color:#e3b95c;font-size:20px;margin-top:6px">أكاديمية واشنطن</div></td></tr>
<tr><td style="padding:24px;line-height:1.9"><h1 style="font-size:20px;margin:0 0 12px;color:#0d1b3e">${escapeHtml(o.title)}</h1>
<p style="margin:0 0 18px;white-space:pre-line">${escapeHtml(o.body)}</p>
${cta ? `<p style="margin:0 0 8px"><a href="${escapeHtml(cta)}" style="background:#d4a53f;color:#0a1530;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block">${escapeHtml(o.ctaLabel!)}</a></p>` : ""}
</td></tr><tr><td style="padding:14px 24px;background:#f1ebdc;font-size:12px;color:#5b6478">${escapeHtml(o.footer ?? "تصلك هذه الرسالة لأنك مسجَّل في أكاديمية واشنطن. يمكنك إيقاف رسائل البريد من إعدادات حسابك.")}</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: `${o.title}\n\n${o.body}${cta ? `\n\n${cta}` : ""}` };
}
