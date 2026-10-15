// Pure validation helpers (no framework imports) so they can be unit-tested with `node --test`.

export type RegisterInput = { fullName: string; email: string; phone: string; password: string };
export type FieldErrors = Partial<Record<keyof RegisterInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalizes Egyptian local mobiles (01XXXXXXXXX) to +20..., keeps other international numbers. */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, "");
  if (/^01[0125]\d{8}$/.test(s)) return "+20" + s.slice(1);
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  if (/^00[1-9]\d{7,14}$/.test(s)) return "+" + s.slice(2);
  return null;
}

export function validateRegister(i: RegisterInput): { ok: boolean; errors: FieldErrors; clean?: RegisterInput } {
  const errors: FieldErrors = {};
  const fullName = i.fullName.trim().replace(/\s+/g, " ");
  const email = i.email.trim().toLowerCase();
  const phone = normalizePhone(i.phone);
  if (fullName.length < 3 || fullName.length > 100) errors.fullName = "name";
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "email";
  if (!phone) errors.phone = "phone";
  if (!isStrongPassword(i.password)) errors.password = "password";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, errors, clean: { fullName, email, phone: phone!, password: i.password } };
}

export function isStrongPassword(p: string) {
  return p.length >= 8 && p.length <= 128 && /[A-Za-z\u0600-\u06FF]/.test(p) && /\d/.test(p);
}

/** Only these fields ever reach auth metadata. A submitted "role" is dropped by design. */
export function buildSignupMetadata(i: RegisterInput & Record<string, unknown>) {
  return { full_name: i.fullName, phone: i.phone };
}

/**
 * Returns the path only if it is a same-site relative path, otherwise null.
 * Browsers (WHATWG URL) silently DROP tab/CR/LF inside a URL and treat "\\" like "/", so "/<TAB>/evil.com" or "/\\evil.com"
 * would become the protocol-relative "//evil.com". Control characters and backslashes are therefore rejected outright, and the
 * result is double-checked by parsing it against a dummy origin.
 */
const SAFE_BASE = "http://local.invalid";
export function safeLocalPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  try { if (new URL(raw, SAFE_BASE).origin !== SAFE_BASE) return null; } catch { return null; }
  return raw;
}

/** Prevents open redirects: only same-site relative paths are allowed. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return safeLocalPath(next) ?? fallback;
}

/** Escapes LIKE/ILIKE wildcards so user text is matched literally (PostgreSQL's default escape character is a backslash). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Only absolute https URLs are accepted for links shown on the public site (blocks javascript: and data: URLs). */
export function safeHttpsUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  try { const u = new URL(s); return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}
export type AcademySettings = { name: string; contact_email: string; contact_phone: string; whatsapp: string; facebook: string; instagram: string; youtube: string; registration_open: boolean };
export function validateAcademy(i: Record<string, string>, open: boolean): { ok: true; value: AcademySettings } | { ok: false; error: string } {
  const name = (i.name ?? "").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "a_name" };
  const email = (i.contact_email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "a_email" };
  const phone = (i.contact_phone ?? "").trim(); const wa = (i.whatsapp ?? "").trim();
  for (const p of [phone, wa]) if (p && !/^\+?[0-9 \-()]{7,20}$/.test(p)) return { ok: false, error: "a_phone" };
  const urls: Record<string, string> = {};
  for (const k of ["facebook", "instagram", "youtube"]) { const u = safeHttpsUrl(i[k] ?? ""); if (u === null) return { ok: false, error: "a_url" }; urls[k] = u; }
  return { ok: true, value: { name, contact_email: email, contact_phone: phone, whatsapp: wa, facebook: urls.facebook, instagram: urls.instagram, youtube: urls.youtube, registration_open: open } };
}

export function validateTestimonial(i: { author_name?: string; body?: string; course_title?: string }): { ok: true; value: { author_name: string; body: string; course_title: string | null } } | { ok: false; error: string } {
  const author_name = (i.author_name ?? "").trim().replace(/\s+/g, " ");
  const body = (i.body ?? "").trim();
  const course_title = (i.course_title ?? "").trim();
  if (author_name.length < 2 || author_name.length > 80) return { ok: false, error: "t_author" };
  if (body.length < 10 || body.length > 600) return { ok: false, error: "t_body" };
  if (course_title.length > 150) return { ok: false, error: "t_course" };
  return { ok: true, value: { author_name, body, course_title: course_title || null } };
}
export const cleanBio = (s: string) => s.trim().replace(/\r/g, "").slice(0, 600);
