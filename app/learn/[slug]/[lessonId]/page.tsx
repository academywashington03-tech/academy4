import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOutline } from "@/lib/courses";
import { UUID_RE } from "@/lib/course-validation";
import { signStreamToken, streamPlayerUrl } from "@/lib/stream";
import { completeLesson } from "../../actions";
import QuizCard from "@/components/QuizCard";

export const metadata = { robots: { index: false, follow: false } };
const sizeMb = (b: number) => (b / 1048576).toFixed(1);

function VideoArea({ provider, ref_, userId }: { provider: string | null; ref_: string | null; userId: string }) {
  void userId;
  if (!provider || !ref_) return <div className="flex aspect-video items-center justify-center rounded-lg bg-navy-900 text-ivory-100/70">لا يوجد فيديو لهذا الدرس بعد.</div>;
  let src: string | null = null;
  if (provider === "youtube") src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ref_)}?rel=0`;
  if (provider === "cloudflare_stream") {
    const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE, kid = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, pem = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM;
    if (code && kid && pem) {
      try { src = streamPlayerUrl(code, signStreamToken({ uid: ref_, keyId: kid, pem, ttlSeconds: 2 * 3600 })); } catch { src = null; }
    }
  }
  // If the video service is not configured/unavailable, the rest of the lesson still works.
  if (!src) return <div role="status" className="flex aspect-video items-center justify-center rounded-lg bg-navy-900 p-4 text-center text-ivory-100/80">الفيديو غير متاح مؤقتاً. يمكنك متابعة بقية المحتوى وسنعيد المحاولة لاحقاً.</div>;
  return <iframe src={src} title="Lesson video" className="aspect-video w-full rounded-lg bg-black" allow="accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
}

export default async function LessonPage({ params, searchParams }: { params: Promise<{ slug: string; lessonId: string }>; searchParams: Promise<{ done?: string; error?: string; cert?: string }> }) {
  const { slug, lessonId } = await params; const sp = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !UUID_RE.test(lessonId)) notFound();
  const s = await requirePath(`/learn/${slug}/${lessonId}`);
  const sb = await createClient();

  const { data: course } = await sb.from("courses").select("id, title").eq("slug", slug).maybeSingle();
  if (!course) notFound();
  // The database (RLS) decides: returns a row only for managers, enrolled students, or free previews.
  const { data: lesson } = await sb.from("lessons").select("id, title, description, type, video_provider, video_ref, body, is_free_preview").eq("id", lessonId).eq("course_id", course.id).maybeSingle();
  if (!lesson) redirect(`/courses/${slug}`);

  const { data: enr } = await sb.from("enrollments").select("course_id").eq("course_id", course.id).eq("user_id", s.id).is("revoked_at", null).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();   // an expired enrollment is not access (matches has_access())
  const enrolled = !!enr;
  if (enrolled) await sb.rpc("touch_lesson", { p_lesson: lessonId }); // saves the resume point

  const [outline, { data: done }, { data: files }] = await Promise.all([
    getOutline(course.id),
    sb.from("lesson_progress").select("lesson_id").eq("user_id", s.id).not("completed_at", "is", null),
    sb.from("resources").select("id, title, size_bytes").eq("lesson_id", lessonId),
  ]);
  const doneSet = new Set((done ?? []).map((d) => d.lesson_id as string));
  const flat = outline.flatMap((x) => x.lessons);
  const idx = flat.findIndex((l) => l.id === lessonId);
  const prev = idx > 0 ? flat[idx - 1] : null; const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const required = flat.filter((l) => l.required); const doneCount = required.filter((l) => doneSet.has(l.id)).length;
  const pct = required.length ? Math.round((doneCount / required.length) * 100) : 0;
  const canOpen = (l: { preview: boolean }) => enrolled || l.preview;

  const sidebar = (
    <nav aria-label="محتوى الدورة" className="space-y-4">
      {outline.map((sec) => (
        <div key={sec.id}>
          <p className="mb-1 text-sm font-semibold text-navy-900">{sec.title}</p>
          <ul className="space-y-1">
            {sec.lessons.map((l) => (
              <li key={l.id}>
                {canOpen(l) ? (
                  <Link href={`/learn/${slug}/${l.id}`} aria-current={l.id === lessonId ? "page" : undefined}
                    className={`flex min-h-[44px] items-center gap-2 rounded-md px-2 text-sm ${l.id === lessonId ? "bg-gold-300/40 font-semibold" : "hover:bg-gold-300/20"}`}>
                    <span aria-hidden="true" className={doneSet.has(l.id) ? "text-emerald-700" : "text-ink/30"}>{doneSet.has(l.id) ? "✔" : "○"}</span>{l.title}
                  </Link>
                ) : <span className="flex min-h-[44px] items-center gap-2 px-2 text-sm text-ink/40"><span aria-hidden="true">🔒</span>{l.title}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="container-x py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard" className="text-sm text-navy-700 underline">لوحتي</Link>
        <p className="text-sm text-ink/70">{course.title}{enrolled && ` · ${pct}%`}</p>
      </div>
      {enrolled && <div className="mb-5 h-2 overflow-hidden rounded-full bg-navy-900/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-gold-500" style={{ width: `${pct}%` }} /></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{lesson.title}</h1>
          {sp.done && <p role="status" className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900">تم تسجيل إتمام الدرس. {next ? "" : "أحسنت!"}</p>}
          {sp.cert && <p role="status" className="rounded-md bg-gold-300/40 p-3 text-sm font-semibold">🎓 أتممت متطلبات الدورة! شهادتك جاهزة: <Link href="/certificates" className="underline">شهاداتي</Link></p>}
          {sp.error && <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900">تعذّر حفظ التقدم. حاول مرة أخرى.</p>}
          {lesson.type === "video" && <VideoArea provider={lesson.video_provider} ref_={lesson.video_ref} userId={s.id} />}
          {lesson.description && <p className="text-ink/80">{lesson.description}</p>}
          {lesson.body && <div className="whitespace-pre-wrap rounded-lg bg-ivory-50 p-4 leading-8">{lesson.body}</div>}
          {lesson.type === "quiz" && (enrolled ? <QuizCard lessonId={lessonId} userId={s.id} /> : <p className="rounded-md bg-gold-300/20 p-3 text-sm">الاختبار متاح للمشتركين في الدورة.</p>)}

          {(files?.length ?? 0) > 0 && (
            <section className="rounded-lg border border-navy-900/15 bg-ivory-50 p-4">
              <h2 className="mb-2 font-bold text-navy-900">ملفات الدرس</h2>
              <ul className="divide-y divide-navy-900/10 text-sm">
                {files!.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{f.title} <span className="text-ink/50">({sizeMb(f.size_bytes)} MB)</span></span>
                    <span className="flex gap-2">
                      <a href={`/api/resources/${f.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-navy px-3">فتح</a>
                      <a href={`/api/resources/${f.id}?dl=1`} className="btn border border-navy-900/30 px-3">تنزيل</a>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!enrolled && (
            <p className="rounded-md bg-gold-300/25 p-3 text-sm">هذه معاينة مجانية. <Link href={`/courses/${slug}`} className="font-semibold underline">التحق بالدورة</Link> لحفظ تقدمك ومتابعة بقية الدروس.</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-navy-900/10 pt-4">
            {prev && <Link href={`/learn/${slug}/${prev.id}`} className="btn border border-navy-900/30">◄ السابق</Link>}
            {enrolled && lesson.type !== "quiz" && (
              <form action={completeLesson} className="contents">
                <input type="hidden" name="lesson_id" value={lessonId} /><input type="hidden" name="slug" value={slug} />
                {next && enrolled && <input type="hidden" name="next" value={next.id} />}
                <button className="btn btn-gold">{doneSet.has(lessonId) ? "أتممت هذا الدرس ✔" : next ? "إتمام والانتقال للتالي" : "إتمام الدرس"}</button>
              </form>
            )}
            {next && canOpen(next) && <Link href={`/learn/${slug}/${next.id}`} className="btn border border-navy-900/30">التالي ►</Link>}
          </div>
          <p className="text-xs text-ink/50">يُسجَّل الإتمام عند ضغطك الزر؛ لا نستطيع التحقق من مشاهدة الفيديو بالكامل.</p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <details className="rounded-lg border border-navy-900/15 bg-ivory-50 p-4 lg:hidden"><summary className="min-h-[44px] cursor-pointer font-semibold text-navy-900">محتوى الدورة</summary><div className="mt-2">{sidebar}</div></details>
          <div className="hidden rounded-lg border border-navy-900/15 bg-ivory-50 p-4 lg:block">{sidebar}</div>
        </aside>
      </div>
    </div>
  );
}
