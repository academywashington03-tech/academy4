import Link from "next/link";
import type { Role } from "@/lib/authz";

export const fieldCls = "mt-1 min-h-[44px] w-full rounded-md border border-navy-900/30 bg-white px-3 text-base";
export const cardCls = "rounded-lg border border-navy-900/15 bg-ivory-50 p-4 sm:p-5";

const MESSAGES: Record<string, string> = {
  t_author: "اسم صاحب الرأي من 2 إلى 80 حرفاً.", t_body: "نص الرأي من 10 إلى 600 حرف.", t_course: "عنوان الدورة طويل جداً.", bio_saved: "تم حفظ نبذة المحاضر.",
  g_granted: "تم منح الوصول.", g_revoked: "تم سحب الوصول.", g_suspended: "تم إيقاف الحساب.", g_reactivated: "تمت إعادة تفعيل الحساب.", g_days: "عدد الأيام غير صالح.",
  ann_sent: "تم نشر الإعلان.", ann_invalid: "العنوان أو النص غير صالح.",
  a_name: "اسم الأكاديمية قصير جداً.", a_email: "بريد التواصل غير صالح.", a_phone: "رقم الهاتف غير صالح.", a_url: "الروابط الاجتماعية يجب أن تبدأ بـ https://",
  need_questions: "أنشئ الاختبار وأضف سؤالاً واحداً على الأقل قبل نشر الدرس.",
  q_prompt: "نص السؤال قصير جداً.", q_options: "اكتب من 2 إلى 8 خيارات، كل خيار في سطر.", q_duplicate: "الخيارات مكررة.", q_correct: "حدد رقم الإجابة الصحيحة بشكل صحيح.", q_settings: "إعدادات الاختبار غير صالحة (درجة النجاح 1–100).", q_saved: "تم حفظ الاختبار.", q_added: "تمت إضافة السؤال.", cert_revoked: "تم إلغاء الشهادة.",
  c_code: "رمز الكوبون: 3 إلى 30 حرفاً إنجليزياً أو أرقاماً أو - _", c_value: "قيمة الخصم غير صالحة (النسبة من 1 إلى 99، أو مبلغ أكبر من صفر).",
  c_expires: "تاريخ الانتهاء بصيغة YYYY-MM-DD.", c_max: "حد الاستخدام غير صالح.", c_scope: "نطاق الكوبون غير صالح.", c_dup: "هذا الرمز مستخدم.",
  c_used: "لا يمكن حذف كوبون استُخدم في طلبات. عطّله بدلاً من ذلك.",
  b_invalid: "بيانات الحزمة غير صالحة (العنوان أو الرابط أو السعر أو مدة الاشتراك).", b_empty: "أضف دورة واحدة على الأقل قبل نشر الحزمة.",
  b_used: "لا يمكن حذف حزمة عليها طلبات. أرشفها بدلاً من ذلك.",
  m_approved: "تم اعتماد الدفع وتفعيل الاشتراك.", m_rejected: "تم رفض الطلب.", m_state: "تعذّر التنفيذ: الطلب لم يعد بانتظار المراجعة.",
  saved: "تم الحفظ.", deleted: "تم الحذف.", moved: "تم تغيير الترتيب.", section_added: "تمت إضافة القسم.", duplicated: "تم إنشاء نسخة (مسودة، بدون ملفات).",
  published: "تم نشر الدورة.", draft: "أُعيدت الدورة إلى مسودة.", archived: "تمت أرشفة الدورة.", instructor: "تم تعيين المستخدم مدرّساً.", student: "أُعيد المستخدم إلى طالب.",
  title: "العنوان قصير جداً.", price: "السعر غير صالح. اكتب رقماً مثل 150 أو 149.50.", promo: "سعر العرض يجب أن يكون أقل من السعر الأصلي.", slug: "الرابط يقبل حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.",
  slug_taken: "هذا الرابط مستخدم.", duration: "المدة غير صالحة.", access_days: "مدة الوصول غير صالحة.", pass_score: "درجة النجاح بين 0 و100.",
  not_ready: "الدورة غير جاهزة للنشر: راجع العنوان والرابط والسعر.", no_published_lessons: "انشر درساً واحداً على الأقل قبل نشر الدورة.",
  has_students: "لا يمكن حذف دورة بها طلاب. استخدم الأرشفة بدلاً من ذلك.", video: "رابط أو معرّف الفيديو غير صالح.", need_video: "أضف الفيديو قبل نشر الدرس.",
  need_body: "اكتب نص الدرس قبل نشره.", need_file: "ارفع ملفاً قبل نشر هذا الدرس.", invalid: "بيانات غير صالحة.", email: "بريد غير صالح.",
  not_found: "لا يوجد مستخدم بهذا البريد. يجب أن يسجّل حساباً أولاً.", protected: "لا يمكن تغيير دور المدير من هنا.", bad_request: "طلب غير صالح.", failed: "تعذّر تنفيذ العملية. حاول مرة أخرى.",
};
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  const msg = MESSAGES[(error ?? ok)!] ?? (error ? MESSAGES.failed : MESSAGES.saved);
  return <p role={error ? "alert" : "status"} className={`mb-4 rounded-md p-3 text-sm ${error ? "bg-red-100 text-red-900" : "bg-emerald-100 text-emerald-900"}`}>{msg}</p>;
}

export function AdminNav({ role }: { role: Role }) {
  const items = [
    { href: "/admin", label: "نظرة عامة" }, { href: "/admin/courses", label: "الدورات" }, { href: "/admin/announcements", label: "الإعلانات" },
    ...(role === "super_admin" ? [{ href: "/admin/orders", label: "الطلبات" }, { href: "/admin/manual-payments", label: "الدفع اليدوي" }, { href: "/admin/coupons", label: "الكوبونات" }, { href: "/admin/certificates", label: "الشهادات" }, { href: "/admin/bundles", label: "الحزم" }, { href: "/admin/students", label: "الطلاب" }, { href: "/admin/testimonials", label: "الآراء" }, { href: "/admin/reports", label: "التقارير" }, { href: "/admin/audit-log", label: "سجل التدقيق" }, { href: "/admin/settings", label: "الإعدادات" }, { href: "/admin/categories", label: "التصنيفات" }, { href: "/admin/instructors", label: "المدرّسون" }] : []),
  ];
  return (
    <nav aria-label="Admin" className="border-b border-navy-900/15 bg-ivory-50">
      <ul className="container-x flex gap-1 overflow-x-auto py-2 text-sm">
        {items.map((i) => <li key={i.href}><Link href={i.href} className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-md px-4 font-medium text-navy-900 hover:bg-gold-300/30">{i.label}</Link></li>)}
      </ul>
    </nav>
  );
}
