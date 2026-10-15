import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { setInstructorRole } from "../actions";
import { setInstructorBio } from "../ops-actions";

export default async function Instructors({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePath("/admin/instructors");
  const sp = await searchParams;
  const { data } = await (await createClient()).from("profiles").select("id, full_name, email, bio").eq("role", "instructor");
  return (
    <div className="container-x max-w-2xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">المدرّسون</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={setInstructorRole} className={`${cardCls} space-y-3`}>
        <p className="text-sm text-ink/70">اطلب من المدرّس أن يسجّل حساباً عادياً أولاً، ثم اكتب بريده هنا لترقيته. بعدها عيّنه على الدورة من صفحة تعديل الدورة.</p>
        <label className="block text-sm font-medium">بريد المستخدم<input name="email" type="email" dir="ltr" required className={fieldCls} /></label>
        <input type="hidden" name="role" value="instructor" />
        <button className="btn btn-gold w-full sm:w-auto">تعيين كمدرّس</button>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{p.full_name} <span dir="ltr" className="text-ink/50">{p.email}</span></span>
            <span className="flex gap-2"><a href={`/admin/audit-log?actor=${p.id}`} className="btn border border-navy-900/30 px-3">نشاطه</a><form action={setInstructorRole}><input type="hidden" name="email" value={p.email ?? ""} /><input type="hidden" name="role" value="student" /><button className="btn border border-navy-900/30 px-3">إعادته طالباً</button></form></span>
                    <form action={setInstructorBio} className="mt-3 flex w-full gap-2"><input type="hidden" name="id" value={p.id} /><textarea name="bio" defaultValue={p.bio ?? ""} rows={2} maxLength={600} placeholder="نبذة تظهر في الصفحة الرئيسية (اختياري)" aria-label="نبذة المحاضر" className={`${fieldCls} mt-0`} /><button className="btn border border-navy-900/30 px-3">حفظ النبذة</button></form>
          </li>
        ))}
        {!data?.length && <li className="p-4 text-sm text-ink/60">لا يوجد مدرّسون بعد.</li>}
      </ul>
    </div>
  );
}
