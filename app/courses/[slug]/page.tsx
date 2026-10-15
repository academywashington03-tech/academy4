import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse, getOutline, priceOf } from "@/lib/courses";
import { formatMoney, getLang, t } from "@/lib/i18n";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enrollFree } from "@/app/learn/actions";

type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const c = await getCourse((await params).slug);
  if (!c) return {};
  return { title: c.title, description: c.short || undefined, alternates: { canonical: `/courses/${c.slug}` } };
}

export default async function CoursePage({ params, searchParams }: { params: P; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params; const sp = await searchParams;
  const c = await getCourse(slug);
  if (!c) notFound();
  const lang = await getLang(); const d = t(lang); const ar = lang === "ar";
  const [outline, session] = await Promise.all([getOutline(c.id), getSessionProfile()]);
  let enrolled = false;
  if (session) {
    const { data } = await (await createClient()).from("enrollments").select("revoked_at, expires_at").eq("course_id", c.id).eq("user_id", session.id).maybeSingle();
    enrolled = !!data && !data.revoked_at && (!data.expires_at || new Date(data.expires_at) > new Date());
  }
  const jsonLd = { "@context": "https://schema.org", "@type": "Course", name: c.title, description: c.short, provider: { "@type": "Organization", name: d.brand } };

  let cta: React.ReactNode;
  if (enrolled) cta = <Link href={`/learn/${c.slug}`} className="btn btn-gold mt-4 w-full">{ar ? "متابعة التعلّم" : "Continue learning"}</Link>;
  else if (!c.enrollmentOpen) cta = <p className="mt-4 text-sm text-ink/70">{ar ? "التسجيل مغلق حالياً." : "Enrollment is closed."}</p>;
  else if (c.isFree && session) cta = <form action={enrollFree}><input type="hidden" name="course_id" value={c.id} /><input type="hidden" name="slug" value={c.slug} /><button className="btn btn-gold mt-4 w-full">{ar ? "سجّل مجاناً" : "Enroll for free"}</button></form>;
  else if (c.isFree) cta = <Link href={`/login?next=${encodeURIComponent(`/courses/${c.slug}`)}`} className="btn btn-gold mt-4 w-full">{ar ? "سجّل الدخول للالتحاق" : "Sign in to enroll"}</Link>;
  else cta = <Link href={session ? `/checkout/${c.slug}` : `/login?next=${encodeURIComponent(`/checkout/${c.slug}`)}`} className="btn btn-gold mt-4 w-full">{ar ? "اشترِ الآن" : "Buy now"}</Link>;

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="bg-navy-950 text-ivory-50">
        <div className="container-x py-12">
          <Link href="/courses" className="text-sm text-gold-300 underline underline-offset-4">{d.course.back}</Link>
          <h1 className="mt-4 text-4xl font-bold">{c.title}</h1>
          {c.short && <p className="mt-3 max-w-2xl text-lg text-ivory-100/80">{c.short}</p>}
          <p className="mt-4 text-sm text-gold-300">
            {[c.categoryName?.[lang], d.levels[c.level], c.hours !== null ? `${c.hours} ${d.course.hours}` : null, `${c.lessons} ${d.course.lessons}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          {sp.error && <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900">{ar ? "تعذّر التسجيل في هذه الدورة." : "Could not enroll in this course."}</p>}
          {c.description && <section><h2 className="mb-2 text-2xl font-bold text-navy-900">{d.course.about}</h2><p className="max-w-prose whitespace-pre-line text-ink/85">{c.description}</p></section>}
          {c.goals.length > 0 && <section><h2 className="mb-2 text-2xl font-bold text-navy-900">{d.course.goals}</h2><ul className="list-disc space-y-1 ps-5">{c.goals.map((g) => <li key={g}>{g}</li>)}</ul></section>}
          {c.prerequisites && <section><h2 className="mb-2 text-2xl font-bold text-navy-900">{d.course.prereq}</h2><p>{c.prerequisites}</p></section>}
          {outline.length > 0 && (
            <section>
              <h2 className="mb-3 text-2xl font-bold text-navy-900">{d.course.contents}</h2>
              <div className="divide-y divide-navy-900/15 border-y border-navy-900/15">
                {outline.map((s) => (
                  <details key={s.id} className="py-3" open>
                    <summary className="min-h-[44px] cursor-pointer list-none font-semibold text-navy-900">{s.title}</summary>
                    <ul className="mt-1 space-y-1 ps-4 text-sm text-ink/80">{s.lessons.map((l) => <li key={l.id}>{l.title}{l.preview && <span className="ms-2 text-xs text-gold-700">{ar ? "معاينة مجانية" : "free preview"}</span>}</li>)}</ul>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="h-fit rounded-lg border border-gold-500/50 bg-ivory-50 p-5 lg:sticky lg:top-24">
          <p className="text-3xl font-bold text-navy-900">{c.isFree ? d.course.free : formatMoney(priceOf(c), lang)}</p>
          {c.promoMinor && !c.isFree ? <s className="text-sm text-ink/50">{formatMoney(c.priceMinor, lang)}</s> : null}
          {cta}
          {c.instructor && <p className="mt-4 text-sm text-ink/70">{d.course.by}: {c.instructor}</p>}
        </aside>
      </div>
    </article>
  );
}
