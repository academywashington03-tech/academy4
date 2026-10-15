import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/AdminUI";

const STATUS: Record<string, string> = { draft: "مسودة", published: "منشورة", archived: "مؤرشفة" };

export default async function CoursesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await requirePath("/admin/courses");
  const sp = await searchParams;
  const sb = await createClient();
  let q = sb.from("courses").select("id, title, status, is_free, price_minor, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (s.role === "instructor") {
    const { data: extra } = await sb.from("course_instructors").select("course_id").eq("instructor_id", s.id);
    const ids = (extra ?? []).map((r) => r.course_id as string);
    q = q.or(`instructor_id.eq.${s.id}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
  }
  const { data: list } = await q;
  return (
    <div className="container-x py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-navy-900">الدورات</h1>
        {s.role === "super_admin" && <Link href="/admin/courses/new" className="btn btn-gold">دورة جديدة</Link>}
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(list ?? []).map((c) => (
          <li key={c.id}>
            <Link href={`/admin/courses/${c.id}`} className="flex min-h-[56px] items-center justify-between gap-3 p-4 hover:bg-gold-300/20">
              <span className="font-semibold text-navy-900">{c.title}</span>
              <span className="text-sm text-ink/60">{STATUS[c.status]} · {c.is_free ? "مجانية" : `${(c.price_minor / 100).toLocaleString("ar-EG")} ج.م`}</span>
            </Link>
          </li>
        ))}
        {!list?.length && <li className="p-6 text-center text-ink/60">لا توجد دورات بعد.</li>}
      </ul>
    </div>
  );
}
