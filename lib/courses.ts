// Data access for the PUBLIC catalog (published courses only), backed by the `public_courses` view.
import type { Lang } from "./i18n";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";

export type Category = { slug: string; nameAr: string; nameEn: string | null };
export type Course = {
  id: string; slug: string; title: string; short: string; description: string; coverUrl: string | null;
  categorySlug: string | null; categoryName: { ar: string; en: string } | null;
  level: "beginner" | "intermediate" | "advanced"; hours: number | null; lessons: number;
  priceMinor: number; promoMinor: number | null; isFree: boolean; instructor: string | null;
  goals: string[]; prerequisites: string; enrollmentOpen: boolean; certificate: boolean; enrollments: number;
};
export type CourseFilters = { q?: string; category?: string; sort?: "newest" | "priceAsc" | "priceDesc"; free?: boolean };
export type OutlineSection = { id: string; title: string; lessons: { id: string; title: string; kind: string; preview: boolean; required: boolean }[] };

/* eslint-disable @typescript-eslint/no-explicit-any */
const map = (r: any): Course => ({
  id: r.id, slug: r.slug, title: r.title, short: r.short_description ?? "", description: r.description ?? "", coverUrl: r.cover_url,
  categorySlug: r.category_slug, categoryName: r.category_slug ? { ar: r.category_name_ar, en: r.category_name_en || r.category_name_ar } : null,
  level: (["beginner", "intermediate", "advanced"].includes(r.level) ? r.level : "beginner"),
  hours: r.duration_minutes ? Math.round((r.duration_minutes / 60) * 10) / 10 : null, lessons: r.lesson_count ?? 0,
  priceMinor: r.price_minor, promoMinor: r.promo_price_minor, isFree: r.is_free, instructor: r.instructor_name,
  goals: r.objectives ?? [], prerequisites: r.prerequisites ?? "", enrollmentOpen: r.enrollment_open, certificate: r.certificate_enabled, enrollments: r.enrollment_count ?? 0,
});

export const priceOf = (c: Course) => (c.isFree ? 0 : c.promoMinor ?? c.priceMinor);
export const categoryLabel = (c: Category, l: Lang) => (l === "en" && c.nameEn ? c.nameEn : c.nameAr);

export async function listCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await (await createClient()).from("categories").select("slug, name_ar, name_en").order("sort_order");
  return (data ?? []).map((r: any) => ({ slug: r.slug, nameAr: r.name_ar, nameEn: r.name_en }));
}

export async function listCourses(f: CourseFilters = {}): Promise<Course[]> {
  if (!isSupabaseConfigured()) return [];
  let q = (await createClient()).from("public_courses").select("*").limit(100);
  if (f.category) q = q.eq("category_slug", f.category);
  if (f.free) q = q.eq("is_free", true);
  const term = f.q?.replace(/[%_,()*\\]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,short_description.ilike.%${term}%`);
  q = f.sort === "priceAsc" ? q.order("price_minor", { ascending: true })
    : f.sort === "priceDesc" ? q.order("price_minor", { ascending: false })
    : q.order("created_at", { ascending: false });
  const { data } = await q;
  return (data ?? []).map(map);
}

export async function getCourse(slug: string): Promise<Course | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await (await createClient()).from("public_courses").select("*").eq("slug", slug).maybeSingle();
  return data ? map(data) : null;
}

export async function getOutline(courseId: string): Promise<OutlineSection[]> {
  const { data } = await (await createClient()).rpc("course_outline", { p_course: courseId });
  const out: OutlineSection[] = [];
  for (const r of (data ?? []) as any[]) {
    let s = out.find((x) => x.id === r.section_id);
    if (!s) { s = { id: r.section_id, title: r.section_title, lessons: [] }; out.push(s); }
    if (r.lesson_id) s.lessons.push({ id: r.lesson_id, title: r.lesson_title, kind: r.kind, preview: r.is_free_preview, required: r.required });
  }
  return out;
}

export type PublicInstructor = { id: string; name: string; bio: string | null };
export async function listInstructors(): Promise<PublicInstructor[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await (await createClient()).from("public_instructors").select("id, full_name, bio").order("full_name").limit(12);
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.full_name, bio: r.bio }));
}
export type PublicTestimonial = { id: string; author: string; body: string; course: string | null };
export async function listTestimonials(): Promise<PublicTestimonial[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await (await createClient()).from("testimonials").select("id, author_name, body, course_title").eq("published", true).order("sort_order").order("created_at", { ascending: false }).limit(6);
  return (data ?? []).map((r: any) => ({ id: r.id, author: r.author_name, body: r.body, course: r.course_title }));
}
