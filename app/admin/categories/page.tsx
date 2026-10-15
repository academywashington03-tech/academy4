import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { saveCategory, deleteCategory } from "../actions";

export default async function Categories({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePath("/admin/categories");
  const sp = await searchParams;
  const { data } = await (await createClient()).from("categories").select("id, slug, name_ar, name_en").order("sort_order");
  return (
    <div className="container-x max-w-2xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">التصنيفات</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={saveCategory} className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
        <label className="text-sm font-medium">الاسم بالعربية<input name="name_ar" required className={fieldCls} /></label>
        <label className="text-sm font-medium">الاسم بالإنجليزية<input name="name_en" dir="ltr" className={fieldCls} /></label>
        <label className="text-sm font-medium sm:col-span-2">الرابط (إنجليزي، مثل: languages)<input name="slug" dir="ltr" className={fieldCls} /></label>
        <button className="btn btn-gold sm:col-span-2">إضافة تصنيف</button>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 p-3">
            <span>{c.name_ar} <span dir="ltr" className="text-xs text-ink/50">/{c.slug}</span></span>
            <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="btn border border-red-700/40 px-3 text-red-800">حذف</button></form>
          </li>
        ))}
        {!data?.length && <li className="p-4 text-sm text-ink/60">لا توجد تصنيفات.</li>}
      </ul>
    </div>
  );
}
