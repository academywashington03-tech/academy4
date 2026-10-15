import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/supabase/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: "weekly", priority: 1 }, { url: `${SITE_URL}/courses`, changeFrequency: "daily", priority: 0.9 }];
  if (!isSupabaseConfigured()) return base;
  const sb = await createClient();
  const [{ data: c }, { data: b }] = await Promise.all([sb.from("public_courses").select("slug, created_at").limit(5000), sb.from("bundles").select("slug").eq("status", "published").limit(500)]);
  return [...base, ...(c ?? []).map((x) => ({ url: `${SITE_URL}/courses/${x.slug}`, lastModified: x.created_at, priority: 0.7 })), ...(b ?? []).map((x) => ({ url: `${SITE_URL}/bundles/${x.slug}`, priority: 0.6 }))];
}
