import { notFound, redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOutline } from "@/lib/courses";
import Link from "next/link";

export const metadata = { robots: { index: false, follow: false } };

// Resume point: last visited lesson, else first unfinished lesson, else the first lesson.
export default async function LearnEntry({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const s = await requirePath(`/learn/${slug}`);
  const sb = await createClient();
  const { data: course } = await sb.from("courses").select("id").eq("slug", slug).maybeSingle();
  if (!course) notFound();
  const { data: enr } = await sb.from("enrollments").select("last_lesson_id").eq("course_id", course.id).eq("user_id", s.id).is("revoked_at", null).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle();
  const { data: ok } = await sb.rpc("manages_course", { cid: course.id });
  if (!enr && ok !== true) redirect(`/courses/${slug}`);

  const lessons = (await getOutline(course.id)).flatMap((x) => x.lessons);
  if (!lessons.length) return <div className="container-x py-16 text-center"><p>لا توجد دروس منشورة بعد.</p><Link href="/dashboard" className="btn btn-navy mt-4">لوحتي</Link></div>;
  const { data: done } = await sb.from("lesson_progress").select("lesson_id").eq("user_id", s.id).not("completed_at", "is", null);
  const doneSet = new Set((done ?? []).map((d) => d.lesson_id as string));
  const target = lessons.find((l) => l.id === enr?.last_lesson_id && !doneSet.has(l.id)) ?? lessons.find((l) => !doneSet.has(l.id)) ?? lessons.find((l) => l.id === enr?.last_lesson_id) ?? lessons[0];
  redirect(`/learn/${slug}/${target.id}`);
}
