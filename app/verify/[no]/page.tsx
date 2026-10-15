import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isCertNo, normalizeCertNo } from "@/lib/quiz";
import { allow } from "@/lib/ratelimit";

// Public, but not indexed by search engines (it shows a person's name).
export const metadata = { title: "التحقق من شهادة | Verify certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type CertRow = { student_name: string; course_title: string; instructor_name: string | null; issued_at: string; revoked: boolean; certificate_no: string };

export default async function Verify({ params }: { params: Promise<{ no: string }> }) {
  const raw = (await params).no;
  let decoded = raw; try { decoded = decodeURIComponent(raw); } catch { /* malformed %-escape: treat as a number that does not exist instead of a 500 */ }
  const no = normalizeCertNo(decoded);
  const limited = !(await allow("verify", 40, 60));   // slows number guessing
  let row: CertRow | null = null;
  if (!limited && isCertNo(no) && isSupabaseConfigured()) {
    const { data } = await (await createClient()).rpc("verify_certificate", { p_no: no });
    row = ((data as CertRow[] | null) ?? [])[0] ?? null;
  }
  const valid = !!row && !row.revoked;
  return (
    <div className="container-x max-w-xl py-14">
      <h1 className="mb-6 text-3xl font-bold text-navy-900">التحقق من الشهادة</h1>
      <div role="status" className={`rounded-lg border p-6 ${valid ? "border-emerald-700/40 bg-emerald-50" : "border-red-700/40 bg-red-50"}`}>
        {valid && row ? (
          <>
            <p className="text-xl font-bold text-emerald-900">✔ شهادة صحيحة صادرة عن أكاديمية واشنطن</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-ink/60">الاسم</dt><dd className="text-lg font-semibold">{row.student_name}</dd></div>
              <div><dt className="text-ink/60">الدورة</dt><dd className="font-semibold">{row.course_title}</dd></div>
              <div><dt className="text-ink/60">تاريخ الإصدار</dt><dd>{new Date(row.issued_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</dd></div>
              {row.instructor_name && <div><dt className="text-ink/60">المحاضر</dt><dd>{row.instructor_name}</dd></div>}
              <div><dt className="text-ink/60">رقم الشهادة</dt><dd dir="ltr" className="font-mono">{row.certificate_no}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-ink/60">هذه شهادة إتمام صادرة عن الأكاديمية، وليست اعتماداً حكومياً أو جامعياً.</p>
          </>
        ) : row?.revoked ? <p className="text-xl font-bold text-red-900">هذه الشهادة ملغاة.</p>
          : limited ? <p className="text-xl font-bold text-red-900">محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.</p>
          : <p className="text-xl font-bold text-red-900">لم نجد شهادة بهذا الرقم. تأكد من كتابته كما هو على الشهادة.</p>}
      </div>
      <p className="mt-6 text-sm"><Link href="/" className="text-navy-700 underline">الصفحة الرئيسية</Link></p>
    </div>
  );
}
