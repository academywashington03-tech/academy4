import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash, fieldCls, cardCls } from "@/components/AdminUI";
import { publishAnnouncement } from "../ops-actions";

export default async function Announcements({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; n?: string }> }) {
  const s = await requirePath("/admin/announcements"); const sp = await searchParams;
  const sb = await createClient();
  let cq = sb.from("courses").select("id, title").neq("status", "archived").order("title");
  if (s.role === "instructor") cq = cq.eq("instructor_id", s.id);
  const [{ data: courses }, { data: list }] = await Promise.all([cq, sb.from("announcements").select("id, title, body, course_id, created_at, courses(title)").order("created_at", { ascending: false }).limit(20)]);
  return (
    <div className="container-x max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-bold text-navy-900">الإعلانات</h1>
      <Flash ok={sp.ok} error={sp.error} />
      {sp.n && <p className="-mt-3 text-sm text-ink/70">وصل الإعلان إلى {sp.n} مستخدماً (إشعار داخل الموقع، ورسالة بريد لمن فعّل ذلك).</p>}
      <form action={publishAnnouncement} className={`${cardCls} space-y-3`}>
        <label className="block text-sm font-medium">المستلمون
          <select name="scope" className={fieldCls}>{s.role === "super_admin" && <option value="platform">كل مستخدمي المنصة</option>}{(courses ?? []).map((c) => <option key={c.id} value={c.id}>طلاب دورة: {c.title}</option>)}</select></label>
        <label className="block text-sm font-medium">العنوان<input name="title" required maxLength={150} className={fieldCls} /></label>
        <label className="block text-sm font-medium">النص<textarea name="body" required rows={5} maxLength={5000} className={fieldCls} /></label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked /> إرسال نسخة بالبريد (حدود مزوّد البريد المجاني قد تؤخر الإرسال لعدد كبير)</label>
        <button className="btn btn-gold">نشر الإعلان</button>
      </form>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-sm">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {((list ?? []) as any[]).map((a) => <li key={a.id} className="p-3"><p className="font-semibold">{a.title} <span className="text-xs font-normal text-ink/60">· {a.courses?.title ?? "كل المنصة"} · {new Date(a.created_at).toLocaleDateString("ar-EG")}</span></p><p className="mt-1 whitespace-pre-line text-ink/70">{a.body}</p></li>)}
        {!list?.length && <li className="p-4 text-ink/60">لا توجد إعلانات.</li>}
      </ul>
    </div>
  );
}
