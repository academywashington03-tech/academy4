#!/usr/bin/env node
// Checks WHICH environment variables are set. It NEVER prints a value.
//   node scripts/check-env.mjs                  -> reads .env.local (if present) + the current environment
//   node scripts/check-env.mjs --production     -> stricter checks for a live site
//   node scripts/check-env.mjs --file .env.vercel-copy
// Exit code 0 = all REQUIRED groups for the selected mode are complete, 1 = something required is missing/invalid.
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const production = args.includes("--production");
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : ".env.local";

const fromFile = {};
if (existsSync(fileArg)) {
  for (const raw of readFileSync(fileArg, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(raw);
    if (!m) continue;
    let v = m[2];
    if (!/^["']/.test(v)) v = v.replace(/\s+#.*$/, "");   // inline comments only for unquoted values
    fromFile[m[1]] = v.replace(/^["']|["']$/g, "");
  }
}
const get = (k) => (process.env[k] ?? fromFile[k] ?? "").trim();
const has = (k) => get(k) !== "";
const looksPlaceholder = (k) => /(your-|changeme|example\.com|xxxx|<.*>|\.\.\.)/i.test(get(k));

const groups = [
  { id: "core", title: "الأساس (لتشغيل الموقع والتسجيل)", required: true, vars: ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] },
  { id: "server", title: "مفتاح الخادم (الدفع، البريد، تحديد المعدل، التصدير)", required: true, vars: ["SUPABASE_SERVICE_ROLE_KEY"] },
  { id: "pay", title: "الدفع الإلكتروني Paymob", required: production, vars: ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_HMAC_SECRET"] },
  { id: "video", title: "الفيديو المحمي Cloudflare Stream", required: false, vars: ["CLOUDFLARE_STREAM_CUSTOMER_CODE", "CLOUDFLARE_STREAM_SIGNING_KEY_ID", "CLOUDFLARE_STREAM_SIGNING_KEY_PEM"] },
  { id: "mail", title: "البريد الإلكتروني للإشعارات", required: false, vars: ["EMAIL_PROVIDER_API_KEY", "EMAIL_FROM"] },
  { id: "cron", title: "مهمة البريد اليومية", required: production, vars: ["CRON_SECRET"] },
];

let failed = false;
const problems = [];
console.log(`فحص متغيرات البيئة (${production ? "وضع الإنتاج" : "وضع التطوير"}) — لا تُعرض أي قيم\n`);
for (const g of groups) {
  const missing = g.vars.filter((v) => !has(v));
  const state = missing.length === 0 ? "✔ مكتمل" : missing.length === g.vars.length ? (g.required ? "✘ ناقص (مطلوب)" : "– غير مضبوط (اختياري)") : "✘ جزئي";
  console.log(`${state.padEnd(22)} ${g.title}`);
  for (const v of g.vars) console.log(`    ${has(v) ? "SET    " : "missing"}  ${v}`);
  if (missing.length && (g.required || missing.length !== g.vars.length)) { failed = true; problems.push(`${g.id}: ناقص ${missing.join(", ")}`); }
}

// ---- sanity checks (no values printed) ----
const warn = (m) => { problems.push(m); failed = true; };
const url = get("NEXT_PUBLIC_SITE_URL");
if (url) {
  try {
    const u = new URL(url);
    if (production && (u.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname))) warn("NEXT_PUBLIC_SITE_URL يجب أن يكون https وعنواناً علنياً في الإنتاج");
    if (/\/$/.test(url)) console.log("\nتنبيه: أزل الشرطة المائلة الأخيرة من NEXT_PUBLIC_SITE_URL");
  } catch { warn("NEXT_PUBLIC_SITE_URL ليس رابطاً صالحاً"); }
}
const sb = get("NEXT_PUBLIC_SUPABASE_URL");
if (sb && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(sb)) console.log("\nتنبيه: شكل NEXT_PUBLIC_SUPABASE_URL غير معتاد (المتوقع https://<المشروع>.supabase.co)");
if (has("SUPABASE_SERVICE_ROLE_KEY") && get("SUPABASE_SERVICE_ROLE_KEY") === get("NEXT_PUBLIC_SUPABASE_ANON_KEY")) warn("SUPABASE_SERVICE_ROLE_KEY مطابق لمفتاح anon: على الأرجح نسخت المفتاح الخطأ");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PAYMOB_SECRET_KEY", "PAYMOB_HMAC_SECRET", "EMAIL_PROVIDER_API_KEY", "CRON_SECRET"]) {
  if (has(k) && looksPlaceholder(k)) warn(`${k} يبدو قيمة تجريبية/نموذجية وليس قيمة حقيقية`);
}
if (has("CRON_SECRET") && get("CRON_SECRET").length < 24) warn("CRON_SECRET قصير؛ استخدم نصاً عشوائياً من 32 حرفاً فأكثر");
if (has("CLOUDFLARE_STREAM_SIGNING_KEY_PEM") && !/^(-----BEGIN|[A-Za-z0-9+/=]{200,})/.test(get("CLOUDFLARE_STREAM_SIGNING_KEY_PEM").replace(/\s/g, ""))) warn("CLOUDFLARE_STREAM_SIGNING_KEY_PEM لا يشبه مفتاحاً (يجب أن يكون النص المشفّر base64 كما يعطيه Cloudflare)");
// A secret must never be exposed to the browser.
for (const k of new Set([...Object.keys(process.env), ...Object.keys(fromFile)])) {
  if (/^NEXT_PUBLIC_.*(SECRET|SERVICE|HMAC|PRIVATE|PASSWORD|TOKEN|PEM|API_KEY)/.test(k)) warn(`${k}: متغيرات NEXT_PUBLIC_ تظهر في المتصفح — لا تضع فيها أسراراً`);
}
if (!existsSync(fileArg) && !has("NEXT_PUBLIC_SUPABASE_URL")) console.log(`\nملاحظة: الملف ${fileArg} غير موجود ولا توجد متغيرات في البيئة الحالية.`);

console.log("\n" + (failed ? "النتيجة: ✘ توجد مشاكل:\n  - " + problems.join("\n  - ") : "النتيجة: ✔ كل المطلوب لهذا الوضع مكتمل (هذا لا يثبت أن القيم صحيحة أو أن الخدمات متصلة)"));
process.exit(failed ? 1 : 0);
