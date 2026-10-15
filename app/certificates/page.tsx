import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "شهاداتي | My certificates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Certificates() {
  const s = await requirePath("/certificates");
  const sb = await createClient();
  // Issue any certificate the student has now earned (the database decides eligibility; others return null).
  const { data: enr } = await sb.from("enrollments").select("course_id").eq("user_id", s.id).is("revoked_at", null).limit(50);
  for (const e of enr ?? []) await sb.rpc("try_issue_certificate", { p_course: e.course_id });
  const { data } = await sb.from("certificates").select("id, certificate_no, course_title, issued_at, revoked_at").eq("user_id", s.id).order("issued_at", { ascending: false });
  return (
    <div className="container-x max-w-3xl py-10">
      <Link href="/dashboard" className="text-sm text-navy-700 underline">لوحتي</Link>
      <h1 className="mb-5 mt-2 text-3xl font-bold text-navy-900">شهاداتي</h1>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span><span className="font-semibold text-navy-900">{c.course_title}</span><br /><span dir="ltr" className="font-mono text-xs text-ink/60">{c.certificate_no}</span> · {new Date(c.issued_at).toLocaleDateString("ar-EG")}{c.revoked_at && <span className="text-red-800"> · ملغاة</span>}</span>
            {!c.revoked_at && <span className="flex gap-2"><Link href={`/certificates/${c.certificate_no}`} className="btn btn-navy px-3">عرض / حفظ PDF</Link><Link href={`/verify/${c.certificate_no}`} className="btn border border-navy-900/30 px-3">صفحة التحقق</Link></span>}
          </li>
        ))}
        {!data?.length && <li className="p-6 text-center text-ink/60">لم تحصل على شهادات بعد. تُصدر الشهادة تلقائياً عند إتمام كل الدروس المطلوبة والنجاح في الاختبارات المطلوبة للدورات التي تمنح شهادة.</li>}
      </ul>
    </div>
  );
}
