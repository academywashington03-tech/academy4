import { requirePath } from "@/lib/auth";
import { createCourse } from "../../actions";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";

export default async function NewCourse({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePath("/admin/courses/new");
  const sp = await searchParams;
  return (
    <div className="container-x max-w-xl py-8">
      <h1 className="mb-5 text-3xl font-bold text-navy-900">دورة جديدة</h1>
      <Flash error={sp.error} />
      <form action={createCourse} className={`${cardCls} space-y-4`}>
        <label className="block text-sm font-medium">عنوان الدورة<input name="title" required minLength={3} maxLength={150} className={fieldCls} /></label>
        <fieldset className="text-sm">
          <legend className="font-medium">نوع الدورة</legend>
          <label className="me-6 inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="pricing" value="paid" defaultChecked /> مدفوعة</label>
          <label className="inline-flex min-h-[44px] items-center gap-2"><input type="radio" name="pricing" value="free" /> مجانية</label>
        </fieldset>
        <label className="block text-sm font-medium">السعر بالجنيه (للمدفوعة)<input name="price" inputMode="decimal" dir="ltr" placeholder="150" className={fieldCls} /></label>
        <button className="btn btn-gold w-full">إنشاء ومتابعة</button>
        <p className="text-xs text-ink/60">تُنشأ الدورة كمسودة، ولا تظهر للزوار حتى تنشرها.</p>
      </form>
    </div>
  );
}
