import type { Metadata } from "next";
import { getLang, t } from "@/lib/i18n";
import { categoryLabel, listCategories, listCourses, type CourseFilters } from "@/lib/courses";
import CourseCard from "@/components/CourseCard";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatMoney } from "@/lib/i18n";

export const metadata: Metadata = { title: "الدورات | Courses" };

type SP = Promise<{ q?: string; category?: string; sort?: string; free?: string }>;

export default async function CoursesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const lang = await getLang();
  const d = t(lang);
  const categories = await listCategories();
  const sort = (["newest", "priceAsc", "priceDesc"] as const).find((s) => s === sp.sort) ?? "newest";
  const filters: CourseFilters = {
    q: sp.q?.slice(0, 80),
    category: categories.some((c) => c.slug === sp.category) ? sp.category : undefined,
    sort, free: sp.free === "1",
  };
  const list = await listCourses(filters);
  const { data: bundles } = isSupabaseConfigured() ? await (await createClient()).from("bundles").select("slug, title, price_minor, currency, period_days").eq("status", "published").limit(12) : { data: [] };

  const field = "min-h-[44px] w-full rounded-md border border-navy-900/25 bg-ivory-50 px-3 text-sm";
  return (
    <div className="container-x py-10">
      <h1 className="mb-6 text-4xl font-bold text-navy-900">{d.nav.courses}</h1>

      <form method="get" className="mb-8 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <input name="q" defaultValue={sp.q} placeholder={d.course.search} className={field} aria-label={d.course.search} />
        <select name="category" defaultValue={filters.category ?? ""} className={field} aria-label={d.sections.categories}>
          <option value="">{d.course.allCats}</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{categoryLabel(c, lang)}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className={field} aria-label={d.course.sort}>
          <option value="newest">{d.course.newest}</option>
          <option value="priceAsc">{d.course.priceAsc}</option>
          <option value="priceDesc">{d.course.priceDesc}</option>
        </select>
        <button className="btn btn-navy">{d.course.apply}</button>
      </form>

      {list.length === 0 ? (
        <p className="py-16 text-center text-ink/70">{d.course.none}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => <CourseCard key={c.slug} c={c} lang={lang} />)}
        </div>
      )}
      {(bundles?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold text-navy-900">{lang === "ar" ? "الحزم" : "Bundles"}</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {bundles!.map((b) => (
              <li key={b.slug}><Link href={`/bundles/${b.slug}`} className="block rounded-lg border border-gold-500/50 bg-ivory-50 p-4 hover:border-gold-600">
                <span className="font-display text-xl text-navy-900">{b.title}</span>
                <span className="mt-1 block text-sm text-ink/70">{formatMoney(b.price_minor, lang, b.currency)}{b.period_days ? ` · ${b.period_days} ${lang === "ar" ? "يوماً" : "days"}` : ""}</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
