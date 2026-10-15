import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "./actions";

export const metadata = { title: "إعدادات الحساب | Settings", robots: { index: false, follow: false } };
const ERR: Record<string, string> = { name: "الاسم غير صالح.", phone: "رقم الهاتف غير صالح.", failed: "تعذّر الحفظ." };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await requirePath("/settings"); const sp = await searchParams;
  const { data: p } = await (await createClient()).from("profiles").select("phone, notify_email").eq("id", s.id).single();
  const cls = "mt-1 min-h-[44px] w-full rounded-md border border-navy-900/30 bg-white px-3 text-base";
  return (
    <div className="container-x max-w-xl py-10">
      <Link href="/dashboard" className="text-sm text-navy-700 underline">لوحتي</Link>
      <h1 className="mb-5 mt-2 text-3xl font-bold text-navy-900">إعدادات الحساب</h1>
      {sp.ok && <p role="status" className="mb-4 rounded-md bg-emerald-100 p-3 text-sm text-emerald-900">تم الحفظ.</p>}
      {sp.error && <p role="alert" className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-900">{ERR[sp.error] ?? ERR.failed}</p>}
      <form action={updateProfile} className="space-y-4 rounded-lg border border-navy-900/15 bg-ivory-50 p-5">
        <p className="text-sm text-ink/70">البريد: <span dir="ltr">{s.email}</span></p>
        <label className="block text-sm font-medium">الاسم الكامل<input name="fullName" defaultValue={s.fullName} required className={cls} /></label>
        <label className="block text-sm font-medium">الهاتف<input name="phone" type="tel" dir="ltr" defaultValue={p?.phone ?? ""} required className={cls} /></label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="notify_email" defaultChecked={p?.notify_email ?? true} /> إرسال الإشعارات (التفعيل، الشهادات، الإعلانات) إلى بريدي</label>
        <button className="btn btn-gold">حفظ</button>
      </form>
      <p className="mt-4 text-sm text-ink/60">لتغيير كلمة المرور استخدم «نسيت كلمة المرور» من صفحة الدخول.</p>
    </div>
  );
}
