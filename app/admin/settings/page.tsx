import { adminCtx } from "@/lib/admin-helpers";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { saveManualSettings } from "../commerce-actions";
import { saveCertificateSettings } from "../cert-actions";
import { saveAcademySettings, savePolicies } from "../ops-actions";
import { DEFAULT_POLICIES, POLICY_KINDS, POLICY_TITLES, policyKey } from "@/lib/policies";
import { paymobConfig } from "@/lib/paymob";

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { sb } = await adminCtx("/admin/settings"); const sp = await searchParams;
  const { data } = await sb.from("settings").select("value").eq("key", "public.manual_payments").maybeSingle();
  const v = (data?.value ?? {}) as { enabled?: boolean; instructions?: string };
  const { data: cs } = await sb.from("settings").select("value").eq("key", "public.certificate").maybeSingle();
  const { data: ac } = await sb.from("settings").select("value").eq("key", "public.academy").maybeSingle();
  const av = (ac?.value ?? {}) as Record<string, string | boolean | undefined>;
  const { data: pol } = await sb.from("settings").select("key, value").in("key", POLICY_KINDS.map(policyKey));
  const polText = (k: (typeof POLICY_KINDS)[number]) => ((pol ?? []).find((r) => r.key === policyKey(k))?.value as { text?: string } | undefined)?.text ?? DEFAULT_POLICIES[k];
  const e = process.env;
  const status: [string, boolean][] = [
    ["Supabase (الاتصال)", !!e.NEXT_PUBLIC_SUPABASE_URL && !!e.NEXT_PUBLIC_SUPABASE_ANON_KEY], ["مفتاح الخدمة (service role)", !!e.SUPABASE_SERVICE_ROLE_KEY],
    ["Paymob (الدفع الإلكتروني)", !!paymobConfig() && !!e.PAYMOB_HMAC_SECRET], ["Cloudflare Stream (الفيديو المحمي)", !!e.CLOUDFLARE_STREAM_CUSTOMER_CODE && !!e.CLOUDFLARE_STREAM_SIGNING_KEY_ID && !!e.CLOUDFLARE_STREAM_SIGNING_KEY_PEM],
    ["البريد الإلكتروني", !!e.EMAIL_PROVIDER_API_KEY && !!e.EMAIL_FROM], ["مهمة البريد اليومية (CRON_SECRET)", !!e.CRON_SECRET], ["رابط الموقع https", (e.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://")],
  ];
  const cv = (cs?.value ?? {}) as { signatory_name?: string; signatory_title?: string };
  return (
    <div className="container-x max-w-2xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">الإعدادات</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={saveAcademySettings} className={`${cardCls} space-y-3`}>
        <h2 className="text-xl font-bold text-navy-900">بيانات الأكاديمية</h2>
        <label className="block text-sm font-medium">اسم الأكاديمية<input name="name" defaultValue={String(av.name ?? "أكاديمية واشنطن")} required className={fieldCls} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">بريد التواصل<input name="contact_email" type="email" dir="ltr" defaultValue={String(av.contact_email ?? "")} className={fieldCls} /></label>
          <label className="text-sm font-medium">هاتف التواصل<input name="contact_phone" dir="ltr" defaultValue={String(av.contact_phone ?? "")} className={fieldCls} /></label>
          <label className="text-sm font-medium">واتساب (بصيغة دولية +20…)<input name="whatsapp" dir="ltr" defaultValue={String(av.whatsapp ?? "")} className={fieldCls} /></label>
          <label className="text-sm font-medium">Facebook<input name="facebook" dir="ltr" placeholder="https://" defaultValue={String(av.facebook ?? "")} className={fieldCls} /></label>
          <label className="text-sm font-medium">Instagram<input name="instagram" dir="ltr" placeholder="https://" defaultValue={String(av.instagram ?? "")} className={fieldCls} /></label>
          <label className="text-sm font-medium">YouTube<input name="youtube" dir="ltr" placeholder="https://" defaultValue={String(av.youtube ?? "")} className={fieldCls} /></label>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="registration_open" defaultChecked={av.registration_open !== false} /> فتح التسجيل للطلاب الجدد (يُطبَّق في قاعدة البيانات وليس في الواجهة فقط)</label>
        <button className="btn btn-gold">حفظ</button>
        <p className="text-xs text-ink/60">الشعار والألوان ثابتة من هوية الأكاديمية. العملة الحالية الجنيه المصري (EGP).</p>
      </form>

      <form action={saveManualSettings} className={`${cardCls} space-y-4`}>
        <h2 className="text-xl font-bold text-navy-900">الدفع اليدوي</h2>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={v.enabled === true} /> تفعيل الدفع اليدوي (تحويل بنكي / محفظة إلكترونية)</label>
        <label className="block text-sm font-medium">تعليمات الدفع التي تظهر للطالب (رقم الحساب أو المحفظة، الاسم، ما يكتبه في المرجع)
          <textarea name="instructions" defaultValue={v.instructions ?? ""} rows={6} className={fieldCls} /></label>
        <button className="btn btn-gold">حفظ</button>
      </form>
      <form action={saveCertificateSettings} className={`${cardCls} space-y-4`}>
        <h2 className="text-xl font-bold text-navy-900">الشهادات</h2>
        <p className="text-sm text-ink/70">يظهر الاسم والمسمى في خانة التوقيع على الشهادة. إن تُركا فارغين يظهر اسم المحاضر. لا تكتب اعتماداً رسمياً إلا إن كان لديكم ترخيص فعلي.</p>
        <label className="block text-sm font-medium">اسم الموقِّع<input name="signatory_name" defaultValue={cv.signatory_name ?? ""} className={fieldCls} /></label>
        <label className="block text-sm font-medium">المسمى (مثال: مدير الأكاديمية)<input name="signatory_title" defaultValue={cv.signatory_title ?? ""} className={fieldCls} /></label>
        <button className="btn btn-gold">حفظ</button>
      </form>
      <form action={savePolicies} className={`${cardCls} space-y-4`}>
        <h2 className="text-xl font-bold text-navy-900">صفحات السياسات</h2>
        <p className="text-sm text-ink/70">النصوص الظاهرة هنا قوالب عامة مبنية على طريقة عمل المنصة ولم يراجعها محامٍ. عدّلها واعتمدها بنفسك قبل الإطلاق؛ ما تحفظه يظهر للزوار فوراً، ومسح الحقل يعيد القالب العام مع تنبيه «لم تعتمده الإدارة بعد».</p>
        {POLICY_KINDS.map((k) => <label key={k} className="block text-sm font-medium">{POLICY_TITLES[k]}<textarea name={`policy_${k}`} defaultValue={polText(k)} rows={8} maxLength={20000} className={fieldCls} /></label>)}
        <button className="btn btn-gold">حفظ السياسات</button>
      </form>

      <section className={cardCls}>
        <h2 className="mb-3 text-xl font-bold text-navy-900">حالة الربط مع الخدمات</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{status.map(([n, ok]) => <li key={n} className={ok ? "text-emerald-800" : "text-ink/60"}>{ok ? "✔" : "✘"} {n}</li>)}</ul>
        <p className="mt-3 text-xs text-ink/60">المفاتيح السرية لا تُحفظ في قاعدة البيانات ولا تظهر هنا؛ تُضبط في متغيرات البيئة على الاستضافة فقط.</p>
      </section>
    </div>
  );
}
