import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { formatMoney, getLang } from "@/lib/i18n";

type P = Promise<{ slug: string }>;
export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { data } = await (await createClient()).from("bundles").select("title, description").eq("slug", (await params).slug).eq("status", "published").maybeSingle();
  return data ? { title: data.title, description: data.description || undefined } : {};
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function BundlePage({ params }: { params: P }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const sb = await createClient();
  const { data: b } = await sb.from("bundles").select("id, slug, title, description, price_minor, currency, period_days, bundle_courses(courses(title, slug, status))").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!b) notFound();
  const lang = await getLang(); const session = await getSessionProfile();
  const items = ((b as any).bundle_courses ?? []).map((x: any) => x.courses).filter((c: any) => c && c.status === "published");
  const href = `/checkout/bundle/${b.slug}`;
  return (
    <article>
      <header className="bg-navy-950 text-ivory-50"><div className="container-x py-12">
        <Link href="/courses" className="text-sm text-gold-300 underline underline-offset-4">كل الدورات</Link>
        <h1 className="mt-4 text-4xl font-bold">{b.title}</h1>
        {b.description && <p className="mt-3 max-w-2xl text-lg text-ivory-100/80">{b.description}</p>}
      </div></header>
      <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_320px]">
        <section><h2 className="mb-3 text-2xl font-bold text-navy-900">تشمل الحزمة</h2>
          <ul className="divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50">{items.map((c: any) => <li key={c.slug}><Link href={`/courses/${c.slug}`} className="block min-h-[48px] p-3 hover:bg-gold-300/20">{c.title}</Link></li>)}</ul></section>
        <aside className="h-fit rounded-lg border border-gold-500/50 bg-ivory-50 p-5">
          <p className="text-3xl font-bold text-navy-900">{formatMoney(b.price_minor, lang, b.currency)}</p>
          {b.period_days && <p className="mt-1 text-sm text-ink/70">وصول لمدة {b.period_days} يوماً. للتجديد اشترِ الحزمة مرة أخرى قبل الانتهاء أو بعده.</p>}
          <Link href={session ? href : `/login?next=${encodeURIComponent(href)}`} className="btn btn-gold mt-4 w-full">اشترِ الحزمة</Link>
        </aside>
      </div>
    </article>
  );
}
