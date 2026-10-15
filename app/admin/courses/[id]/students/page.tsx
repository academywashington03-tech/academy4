import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Instructors and admins: who is enrolled in THIS course, with progress. Names only (no email/phone) by design.
export default async function CourseStudents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePath("/admin/courses");
  if (!UUID_RE.test(id)) notFound();
  const sb = await createClient();
  const { data: allowed } = await sb.rpc("manages_course", { cid: id });
  if (allowed !== true) notFound();
  const [{ data: course }, { data: rows }] = await Promise.all([sb.from("courses").select("title").eq("id", id).single(), sb.rpc("course_students", { p_course: id })]);
  const now = new Date();
  return (
    <div className="container-x py-8">
      <Link href={`/admin/courses/${id}`} className="text-sm text-navy-700 underline">العودة إلى الدورة</Link>
      <h1 className="mb-1 mt-2 text-3xl font-bold text-navy-900">طلاب الدورة</h1>
      <p className="mb-4 text-sm text-ink/70">{course?.title} · {rows?.length ?? 0} مسجّل</p>
      <div className="overflow-x-auto rounded-lg border border-navy-900/15 bg-ivory-50"><table className="w-full min-w-[640px] text-sm">
        <thead className="bg-navy-900/5"><tr>{["الطالب", "التسجيل", "التقدم", "الاختبارات", "آخر نشاط", "الحالة"].map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-navy-900/10">
          {((rows ?? []) as any[]).map((r) => { const pct = r.lessons_total ? Math.round((r.lessons_done / r.lessons_total) * 100) : 0; const active = !r.revoked && (!r.expires_at || new Date(r.expires_at) > now);
            return <tr key={r.user_id}><td className="p-3 font-semibold">{r.full_name}</td><td className="p-3">{new Date(r.enrolled_at).toLocaleDateString("ar-EG")}</td>
              <td className="p-3"><span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-navy-900/10 align-middle"><span className="block h-full bg-gold-500" style={{ width: `${pct}%` }} /></span> {pct}%</td>
              <td className="p-3">{r.quizzes_passed}/{r.quizzes_total}</td><td className="p-3">{r.last_seen ? new Date(r.last_seen).toLocaleDateString("ar-EG") : "—"}</td>
              <td className={`p-3 ${active ? "text-emerald-800" : "text-red-800"}`}>{active ? "نشط" : r.revoked ? "مسحوب" : "منتهٍ"}</td></tr>; })}
          {!rows?.length && <tr><td colSpan={6} className="p-6 text-center text-ink/60">لا يوجد طلاب بعد.</td></tr>}
        </tbody></table></div>
    </div>
  );
}
