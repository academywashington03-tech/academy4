// Static security invariants. They cannot prove the app is secure, but they fail loudly if a future change
// removes an authorization check, leaks a server-only module to the browser, or leaves a privileged SQL function public.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(n)) continue;
    const p = join(dir, n); const s = statSync(p);
    if (s.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const files = walk(ROOT).map((p) => relative(ROOT, p));
const src = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("tests/"));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("the service-role client is imported only by approved server files", () => {
  const allowed = new Set(["app/api/webhooks/paymob/route.ts", "app/checkout/actions.ts", "lib/outbox.ts", "lib/ratelimit.ts", "lib/supabase/admin.ts"]);
  const offenders = src.filter((f) => /supabase\/admin["']/.test(read(f)) && !allowed.has(f));
  assert.deepEqual(offenders, []);
});

test("browser components never import server-only modules", () => {
  const forbidden = /(supabase\/admin|lib\/outbox|lib\/email["']|lib\/qr|lib\/ratelimit["']|lib\/paymob["'])/;
  const offenders = src.filter((f) => /^["']use client["']/.test(read(f).trimStart()) && forbidden.test(read(f)));
  assert.deepEqual(offenders, []);
});

test("server-only modules declare it (build fails if a client imports them)", () => {
  for (const f of ["lib/supabase/admin.ts", "lib/outbox.ts", "lib/email.ts", "lib/qr.ts", "lib/ratelimit.ts"]) assert.match(read(f), /import "server-only"/, f);
});

test("no secret-looking variable is exposed through NEXT_PUBLIC_", () => {
  const names = new Set<string>();
  for (const f of [...src, ".env.example"]) for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) names.add(m[0]);
  const bad = [...names].filter((n) => /(SECRET|SERVICE|HMAC|PRIVATE|API_KEY|PASSWORD|TOKEN|PEM)/.test(n));
  assert.deepEqual(bad, []);
});

test("every server action calls an authorization guard (or is an approved public auth action)", () => {
  const guards = /(requirePath|adminCtx|guard\(|ctx\(|getSessionProfile|makeOrder|readTarget)/;
  const publicAuth = new Set(["register", "login", "loginWithGoogle", "forgotPassword", "resetPassword", "signOut"]);   // they handle their own auth
  const problems: string[] = [];
  for (const f of src.filter((x) => /^["']use server["']/.test(read(x).trimStart()))) {
    const text = read(f);
    const parts = text.split(/export async function /).slice(1);
    for (const part of parts) {
      const name = part.slice(0, part.indexOf("("));
      const body = part.slice(0, part.indexOf("\nexport ") === -1 ? undefined : part.indexOf("\nexport "));
      if (f === "app/auth/actions.ts" && publicAuth.has(name)) continue;
      if (!guards.test(body)) problems.push(`${f}:${name}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every admin-only action file uses the admin gate", () => {
  for (const f of ["app/admin/commerce-actions.ts", "app/admin/cert-actions.ts"]) {
    const exportsCount = (read(f).match(/export async function /g) ?? []).length;
    const gates = (read(f).match(/adminCtx\(/g) ?? []).length;
    assert.ok(gates >= exportsCount, `${f}: ${gates} gates for ${exportsCount} actions`);
  }
});

test("every route handler authenticates the caller (session, HMAC or secret)", () => {
  const allowedPublic = new Set(["app/api/lang/route.ts", "app/auth/callback/route.ts"]);   // set a cookie / complete an auth code exchange
  const problems = src.filter((f) => /\/route\.ts$/.test(f) && !allowedPublic.has(f))
    .filter((f) => !/(getUser\(|getSessionProfile|handlePaymobCallback|CRON_SECRET)/.test(read(f)));
  assert.deepEqual(problems, []);
});

test("every admin page enforces access (layout gate + per-page check)", () => {
  const pages = src.filter((f) => /^app\/admin\/.*page\.tsx$/.test(f));
  assert.ok(pages.length >= 10);
  const problems = pages.filter((f) => !/(requirePath|adminCtx)\(/.test(read(f)));
  assert.deepEqual(problems, []);
  assert.match(read("app/admin/layout.tsx"), /requirePath\("\/admin"\)/);
});

test("dangerouslySetInnerHTML is limited to reviewed, escaped content", () => {
  const allowed = new Set(["app/courses/[slug]/page.tsx", "components/CertificateSheet.tsx"]);
  const users = src.filter((f) => /dangerouslySetInnerHTML/.test(read(f)));
  assert.deepEqual(users.filter((f) => !allowed.has(f)), []);
  assert.match(read("app/courses/[slug]/page.tsx"), /replace\(\/<\/g, "\\\\u003c"\)/);   // JSON-LD cannot close the script tag
});

test("redirect targets taken from user input go through safeNext", () => {
  assert.match(read("app/auth/actions.ts"), /safeNext\(str\(form, "next"\)\)/);
  assert.match(read("app/auth/callback/route.ts"), /safeNext\(/);
  // The previous startsWith("/") && !startsWith("//") check was bypassable ("/\\evil.com", "/<TAB>/evil.com"); the shared validator is required now.
  assert.match(read("app/api/lang/route.ts"), /safeLocalPath\(back\)/);
  assert.doesNotMatch(read("app/api/lang/route.ts"), /startsWith\("\/"\)/);
});

test("rate limiting is applied to the sensitive entry points", () => {
  for (const [f, name] of [["app/auth/actions.ts", '"login"'], ["app/auth/actions.ts", '"register"'], ["app/auth/actions.ts", '"forgot"'], ["app/verify/[no]/page.tsx", '"verify"'],
    ["app/checkout/actions.ts", '"order"'], ["app/checkout/actions.ts", '"manual_submit"'], ["components/CheckoutView.tsx", '"coupon"']] as const)
    assert.ok(read(f).includes(`allow(${name}`), `${f} ${name}`);
});

test("the webhook authenticates before touching the database", () => {
  const core = read("lib/payments/webhook.ts");
  assert.ok(core.indexOf("verifyHmac(") !== -1 && core.indexOf("verifyHmac(") < core.indexOf("i.rpc("));
  assert.match(read("lib/paymob.ts"), /timingSafeEqual/);
});

test("Next.js and React are on patched versions (several critical advisories in 2025-2026)", () => {
  const pkg = JSON.parse(read("package.json"));
  const v = (x: string) => x.replace(/^[^0-9]*/, "").split(".").map(Number);
  const gte = (a: number[], b: number[]) => { for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i]; } return true; };
  const next = v(pkg.dependencies.next);
  assert.ok(next[0] > 15 || (next[0] === 15 && gte(next, [15, 5, 21])), `next ${pkg.dependencies.next} is below 15.5.21`);
  assert.ok(gte(v(pkg.dependencies.react), [19, 2, 1]), `react ${pkg.dependencies.react} is below 19.2.1`);
});

test("authorization never depends on middleware alone (pages/layouts re-check the role)", () => {
  assert.match(read("lib/auth.ts"), /export async function requirePath/);
  assert.match(read("app/admin/layout.tsx"), /requirePath\(/);
  assert.match(read("app/dashboard/page.tsx"), /requirePath\(/);
});

// ---------------- SQL ----------------
const sql = files.filter((f) => /^supabase\/migrations\/.*\.sql$/.test(f)).sort().map(read).join("\n");

test("every SECURITY DEFINER function pins search_path", () => {
  const defs = [...sql.matchAll(/create (?:or replace )?function\s+(\w+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/gi)].filter((m) => /security definer/i.test(m[0]));
  assert.ok(defs.length > 30);
  const bad = defs.filter((m) => !/set search_path\s*=\s*public/i.test(m[0])).map((m) => m[1]);
  assert.deepEqual(bad, []);
});

test("privileged SQL functions are not callable by every client", () => {
  // Functions that intentionally stay public (they only read through auth.uid() or return non-sensitive facts).
  const intentionallyOpen = new Set(["current_role_of", "is_admin", "manages_course", "has_access", "folder_course_id", "course_outline", "verify_certificate",
    "handle_new_user", "protect_profile_fields", "protect_course_fields", "enforce_registration_open"]);
  const names = [...new Set([...sql.matchAll(/create (?:or replace )?function\s+(\w+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/gi)].filter((m) => /security definer/i.test(m[0])).map((m) => m[1]))];
  const revoked = new Set<string>();
  for (const st of sql.matchAll(/revoke all on function([\s\S]*?);/gi)) for (const n of st[1].matchAll(/(\w+)\s*\(/g)) revoked.add(n[1]);
  const exposed = names.filter((n) => !intentionallyOpen.has(n) && !revoked.has(n));
  assert.deepEqual(exposed, []);
});

test("service-only SQL functions are revoked from authenticated users too", () => {
  for (const fn of ["fulfill_order", "process_online_payment", "queue_notification", "price_item", "hit_rate_limit"]) {
    const m = [...sql.matchAll(new RegExp(`revoke all on function ${fn}\\s*\\([^;]*?from\\s+([^;]*);`, "gi"))].map((x) => x[1]).join(" ");
    assert.match(m, /authenticated/, fn);
  }
});

test("row level security is enabled on every table created in migrations", () => {
  const tables = [...sql.matchAll(/create table (?:if not exists )?(\w+)\s*\(/gi)].map((m) => m[1]);
  const enabled = new Set([...sql.matchAll(/alter table (\w+) enable row level security/gi)].map((m) => m[1]));
  assert.deepEqual(tables.filter((t) => !enabled.has(t)), []);
});

test("no migration grants table privileges to anon", () => {
  assert.doesNotMatch(sql, /grant\s+(all|insert|update|delete)\s+on\s+(table\s+)?\w+\s+to\s+(anon|public)/i);
});

// ---- SQL migration invariants (static: they read the files, they do not run a database) ----
const migrations = files.filter((f) => /^supabase\/migrations\/\d{4}_.*\.sql$/.test(f)).sort();
const latestDefinition = (fn: string) => {
  const hits = migrations.filter((f) => new RegExp(`create (or replace )?function ${fn}\\s*\\(`, "i").test(read(f)));
  return hits.length ? read(hits[hits.length - 1]) : "";
};
test("migrations are numbered 0001..N without gaps or duplicates", () => {
  const nums = migrations.map((f) => Number(/migrations\/(\d{4})_/.exec(f)![1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
});
test("the latest try_issue_certificate does not depend on pgcrypto (it lives in the 'extensions' schema on Supabase)", () => {
  const sql = latestDefinition("try_issue_certificate");
  assert.ok(sql.length > 0);
  assert.doesNotMatch(sql.slice(sql.search(/create (or replace )?function try_issue_certificate/i)), /gen_random_bytes|digest\(|crypt\(/);
});
test("the latest process_online_payment binds a transaction id to a single order", () => {
  const sql = latestDefinition("process_online_payment");
  assert.match(sql, /txn_order_mismatch/);
  assert.match(sql, /returning id into v_txn/);
});
test("route handlers that redirect to a caller-supplied path validate it with safeLocalPath/safeNext", () => {
  for (const f of ["app/api/lang/route.ts", "app/auth/callback/route.ts"]) assert.match(read(f), /safe(LocalPath|Next)\(/, f);
});
