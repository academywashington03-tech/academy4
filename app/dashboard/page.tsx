import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n";
import { signOut } from "@/app/auth/actions";

export const metadata = { title: "لوحة الطالب | Dashboard", robots: { index: false, follow: false } };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function Dashboard() {
  const s = await requirePath("/dashboard");
  const ar = (await getLang()) === "ar";
  const sb = await createClient();
  const { data: anns } = await sb.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(3);
  const [enr, prog, recent] = await Promise.all([
    sb.from("enrollments").select("course_id, last_lesson_id, created_at, expires_at, courses(slug, title, cover_url)").eq("user_id", s.id).is("revoked_at", null).order("created_at", { ascending: false }),
    sb.rpc("my_progress"),
    sb.from("lesson_progress").select("lesson_id, completed_at, last_seen_at, lessons(id, title, courses(slug, title))").eq("user_id", s.id).order("last_seen_at", { ascending: false }).limit(5),
  ]);
  const progress = new Map<string, { total: number; done: number }>((prog.data ?? []).map((p: any) => [p.course_id, { total: p.total, done: p.done }]));
  const now = new Date();
  const items = ((enr.data ?? []) as any[]).filter((e) => e.courses).map((e) => {
    const p = progress.get(e.course_id) ?? { total: 0, done: 0 };
    return { ...e, pct: p.total ? Math.round((p.done / p.total) * 100) : 0, total: p.total, expired: e.expires_at && new Date(e.expires_at) <= now };
  });
  const active = items.filter((i) => !i.expired);
  const completed = active.filter((i) => i.total > 0 && i.pct === 100);
  const cont = active.find((i) => i.last_lesson_id && i.pct < 100) ?? active.find((i) => i.pct < 100);

  return (
    <div className="container-x space-y-10 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">{ar ? `مرحباً، ${s.fullName}` : `Welcome, ${s.fullName}`}</h1>
          <p className="text-sm text-ink/60">{active.length} {ar ? "دورة" : "courses"} · {completed.length} {ar ? "مكتملة" : "completed"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.role !== "student" && <Link href="/admin" className="btn btn-gold">{ar ? "لوحة الإدارة" : "Admin panel"}</Link>}
          <Link href="/certificates" className="btn border border-navy-900/30">{ar ? "شهاداتي" : "Certificates"}</Link>
          <Link href="/orders" className="btn border border-navy-900/30">{ar ? "طلباتي" : "Orders"}</Link>
          <Link href="/settings" className="btn border border-navy-900/30">{ar ? "إعدادات الحساب" : "Account settings"}</Link>
          <form action={signOut}><button className="btn btn-navy">{ar ? "تسجيل الخروج" : "Sign out"}</button></form>
        </div>
      </div>

      {(anns?.length ?? 0) > 0 && (
        <section><h2 className="mb-2 text-xl font-bold text-navy-900">{ar ? "الإعلانات" : "Announcements"}</h2>
          <ul className="space-y-2">{anns!.map((a) => <li key={a.id} className="rounded-lg border border-gold-500/40 bg-gold-300/15 p-3 text-sm"><p className="font-semibold text-navy-900">{a.title}</p><p className="mt-1 whitespace-pre-line text-ink/80">{a.body}</p></li>)}</ul></section>
      )}

      {cont && (
        <section className="rounded-lg bg-navy-950 p-5 text-ivory-50">
          <p className="text-sm text-gold-300">{ar ? "أكمل من حيث توقفت" : "Continue learning"}</p>
          <p className="mt-1 font-display text-2xl">{cont.courses.title}</p>
          <Link href={`/learn/${cont.courses.slug}`} className="btn btn-gold mt-4">{ar ? "متابعة" : "Resume"}</Link>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-2xl font-bold text-navy-900">{ar ? "دوراتي" : "My courses"}</h2>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-navy-900/30 p-8 text-center">
            <p className="text-ink/70">{ar ? "لم تلتحق بأي دورة بعد." : "You have not enrolled in any course yet."}</p>
            <Link href="/courses" className="btn btn-navy mt-4">{ar ? "استعرض الدورات" : "Browse courses"}</Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.course_id} className="rounded-lg border border-navy-900/15 bg-ivory-50 p-4">
                <p className="font-semibold text-navy-900">{i.courses.title}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-navy-900/10" role="progressbar" aria-valuenow={i.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-gold-500" style={{ width: `${i.pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink/60">{i.pct}%{i.expired ? (ar ? " · انتهى الوصول" : " · access expired") : ""}</p>
                {!i.expired && <Link href={`/learn/${i.courses.slug}`} className="btn btn-navy mt-3 w-full">{i.pct === 100 ? (ar ? "مراجعة" : "Review") : (ar ? "متابعة" : "Continue")}</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(recent.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold text-navy-900">{ar ? "آخر ما شاهدته" : "Recently accessed"}</h2>
          <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
            {(recent.data as any[]).filter((r) => r.lessons?.courses).map((r) => (
              <li key={r.lesson_id}><Link className="flex min-h-[48px] items-center justify-between gap-2 px-4 py-2 hover:bg-gold-300/20" href={`/learn/${r.lessons.courses.slug}/${r.lessons.id}`}>
                <span>{r.lessons.title}</span><span className="text-ink/50">{r.lessons.courses.title}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      
    </div>
  );
}
