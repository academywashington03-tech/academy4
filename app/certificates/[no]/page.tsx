import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/supabase/config";
import { isCertNo, normalizeCertNo, verifyUrl } from "@/lib/quiz";
import { qrSvg } from "@/lib/qr";
import CertificateSheet from "@/components/CertificateSheet";
import PrintButton from "@/components/PrintButton";

export const metadata = { title: "الشهادة | Certificate", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ no: string }> }) {
  const no = normalizeCertNo((await params).no);
  if (!isCertNo(no)) notFound();
  await requirePath("/certificates");
  const sb = await createClient();
  // RLS: only the owner (or an administrator) can read this row.
  const { data: c } = await sb.from("certificates").select("certificate_no, student_name, course_title, instructor_name, issued_at, revoked_at").eq("certificate_no", no).maybeSingle();
  if (!c) notFound();
  const { data: st } = await sb.from("settings").select("value").eq("key", "public.certificate").maybeSingle();
  const sig = (st?.value ?? {}) as { signatory_name?: string; signatory_title?: string };
  const url = verifyUrl(SITE_URL, c.certificate_no);

  return (
    <div className="container-x py-6">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Link href="/certificates" className="text-sm text-navy-700 underline">شهاداتي</Link>
        {!c.revoked_at && <PrintButton label="حفظ كـ PDF / طباعة" />}
        <span className="text-xs text-ink/60">من نافذة الطباعة اختر «حفظ بتنسيق PDF»، واجعل الهوامش «بلا» وفعّل «رسومات الخلفية».</span>
      </div>
      {c.revoked_at ? <p role="alert" className="rounded-md bg-red-100 p-4 text-red-900">أُلغيت هذه الشهادة.</p> : (
        <CertificateSheet studentName={c.student_name ?? ""} courseTitle={c.course_title ?? ""} issuedAt={c.issued_at} certNo={c.certificate_no}
          instructorName={c.instructor_name} signatoryName={sig.signatory_name} signatoryTitle={sig.signatory_title}
          qrSvg={await qrSvg(url)} verifyUrl={url} sealSrc="/brand/logo-seal.png" />
      )}
    </div>
  );
}
