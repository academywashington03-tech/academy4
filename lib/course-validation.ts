// Pure helpers for the course editor (unit-tested with `node --test`).

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, ".").replace(/٬/g, "");

/** "150", "150.5", "١٥٠٫٥٠" -> integer piastres. Returns null if invalid / negative / >2 decimals. */
export function parseMoneyToMinor(raw: string): number | null {
  const s = toLatinDigits(raw.trim());
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return minor <= 2_147_483_647 ? minor : null;   // the DB columns are 32-bit integers: reject what they could not store
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
// Slugs that would collide with fixed routes (e.g. /checkout/result, /checkout/bundle/...).
const RESERVED_SLUGS = new Set(["result", "bundle", "manual", "new"]);
export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 80 && !RESERVED_SLUGS.has(s);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VideoProvider = "cloudflare_stream" | "youtube";
/** Extracts a clean provider reference. YouTube is accepted but is NOT access control for paid courses. */
export function parseVideoInput(provider: string, input: string): { provider: VideoProvider; ref: string } | null {
  const v = input.trim();
  if (provider === "cloudflare_stream") return /^[0-9a-f]{32}$/i.test(v) ? { provider, ref: v.toLowerCase() } : null;
  if (provider === "youtube") {
    if (/^[\w-]{11}$/.test(v)) return { provider, ref: v };
    try {
      const u = new URL(v);
      const host = u.hostname.replace(/^www\./, "");
      let id: string | null = null;
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (host === "youtube.com" || host === "m.youtube.com") {
        id = u.searchParams.get("v") ?? (/^\/(embed|shorts|live)\/([\w-]{11})/.exec(u.pathname)?.[2] ?? null);
      }
      return id && /^[\w-]{11}$/.test(id) ? { provider, ref: id } : null;
    } catch { return null; }
  }
  return null;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const RESOURCE_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/zip": ["zip"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"],
};
export const COVER_TYPES: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };

/** Safe storage file name: ASCII only, no path tricks. Original name is kept separately as the display title. */
export function sanitizeFileName(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  return ext ? `file.${ext}` : "file";
}

export function validateUpload(kind: "resource" | "cover", name: string, mime: string, size: number): string | null {
  const types = kind === "cover" ? COVER_TYPES : RESOURCE_TYPES;
  const max = kind === "cover" ? MAX_COVER_BYTES : MAX_UPLOAD_BYTES;
  if (!Number.isFinite(size) || size <= 0) return "empty";
  if (size > max) return "too_large";
  const exts = types[mime];
  if (!exts) return "type";
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (!exts.includes(ext)) return "type";
  return null;
}

export type CourseInput = Record<string, string | undefined>;
export function validateCourseText(i: CourseInput) {
  const errors: string[] = [];
  const title = (i.title ?? "").trim();
  if (title.length < 3 || title.length > 150) errors.push("title");
  const level = ["beginner", "intermediate", "advanced"].includes(i.level ?? "") ? i.level! : "beginner";
  const language = i.language === "en" ? "en" : "ar";
  const duration = i.duration_minutes?.trim() ? Number(toLatinDigits(i.duration_minutes.trim())) : null;
  if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 100000)) errors.push("duration");
  const accessRaw = i.access_days?.trim() ? Number(toLatinDigits(i.access_days.trim())) : null;
  if (accessRaw !== null && (!Number.isInteger(accessRaw) || accessRaw < 1 || accessRaw > 3650)) errors.push("access_days");
  const pass = i.pass_score?.trim() ? Number(toLatinDigits(i.pass_score.trim())) : 70;
  if (!Number.isInteger(pass) || pass < 0 || pass > 100) errors.push("pass_score");
  const objectives = (i.objectives ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  if (errors.length) return { ok: false as const, errors };
  return {
    ok: true as const, errors,
    clean: {
      title, level, language, duration_minutes: duration, access_days: accessRaw, pass_score: pass, objectives,
      short_description: (i.short_description ?? "").trim().slice(0, 300),
      description: (i.description ?? "").trim().slice(0, 10000),
      prerequisites: (i.prerequisites ?? "").trim().slice(0, 2000),
    },
  };
}

export const RECEIPT_TYPES: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "application/pdf": ["pdf"] };
export function validateReceipt(name: string, mime: string, size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "empty";
  if (size > 5 * 1024 * 1024) return "too_large";
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return RECEIPT_TYPES[mime]?.includes(ext) ? null : "type";
}

export type CouponClean = { code: string; percent_off: number | null; amount_off_minor: number | null; expires_at: string | null; max_redemptions: number | null; course_id: string | null; bundle_id: string | null };
export function validateCoupon(i: Record<string, string | undefined>): { ok: true; clean: CouponClean } | { ok: false; error: string } {
  const code = (i.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: "code" };
  let percent: number | null = null, amount: number | null = null;
  if (i.kind === "fixed") { amount = parseMoneyToMinor(i.value ?? ""); if (!amount || amount <= 0) return { ok: false, error: "value" }; }
  else { percent = Number(toLatinDigits((i.value ?? "").trim())); if (!Number.isInteger(percent) || percent < 1 || percent > 99) return { ok: false, error: "value" }; }
  let expires: string | null = null;
  if (i.expires?.trim()) { if (!/^\d{4}-\d{2}-\d{2}$/.test(i.expires.trim()) || Number.isNaN(Date.parse(i.expires.trim()))) return { ok: false, error: "expires" }; expires = `${i.expires.trim()}T23:59:59Z`; }
  let max: number | null = null;
  if (i.max?.trim()) { max = Number(toLatinDigits(i.max.trim())); if (!Number.isInteger(max) || max < 1 || max > 1_000_000) return { ok: false, error: "max" }; }
  let course: string | null = null, bundle: string | null = null;
  const [kind, id] = (i.scope ?? "all").split(":");
  if (kind === "course" && UUID_RE.test(id ?? "")) course = id; else if (kind === "bundle" && UUID_RE.test(id ?? "")) bundle = id; else if (kind !== "all") return { ok: false, error: "scope" };
  return { ok: true, clean: { code, percent_off: percent, amount_off_minor: amount, expires_at: expires, max_redemptions: max, course_id: course, bundle_id: bundle } };
}
