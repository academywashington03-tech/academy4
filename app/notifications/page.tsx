import Link from "next/link";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markAllRead } from "./actions";

export const metadata = { title: "الإشعارات | Notifications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Notifications() {
  const s = await requirePath("/notifications");
  const { data } = await (await createClient()).from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", s.id).order("created_at", { ascending: false }).limit(50);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <div className="container-x max-w-2xl py-10">
      <Link href="/dashboard" className="text-sm text-navy-700 underline">لوحتي</Link>
      <div className="mb-5 mt-2 flex items-center justify-between gap-3"><h1 className="text-3xl font-bold text-navy-900">الإشعارات</h1>
        {unread > 0 && <form action={markAllRead}><button className="btn border border-navy-900/30">تعليم الكل كمقروء</button></form>}</div>
      <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">
        {(data ?? []).map((n) => {
          const inner = <><span className="flex items-center gap-2 font-semibold text-navy-900">{!n.read_at && <span className="h-2 w-2 rounded-full bg-gold-500" aria-label="غير مقروء" />}{n.title}</span>{n.body && <span className="mt-1 block text-sm text-ink/70">{n.body}</span>}<span className="mt-1 block text-xs text-ink/50">{new Date(n.created_at).toLocaleString("ar-EG")}</span></>;
          return <li key={n.id}>{n.link?.startsWith("/") ? <Link href={n.link} className="block p-4 hover:bg-gold-300/20">{inner}</Link> : <div className="p-4">{inner}</div>}</li>;
        })}
        {!data?.length && <li className="p-6 text-center text-ink/60">لا توجد إشعارات.</li>}
      </ul>
    </div>
  );
}
