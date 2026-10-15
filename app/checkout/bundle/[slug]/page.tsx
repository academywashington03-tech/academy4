import { notFound } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CheckoutView from "@/components/CheckoutView";

export const metadata = { title: "إتمام الشراء | Checkout", robots: { index: false, follow: false } };

export default async function BundleCheckout({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; coupon?: string }> }) {
  const { slug } = await params; const sp = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  await requirePath(`/checkout/bundle/${slug}`);
  const { data: b } = await (await createClient()).from("bundles").select("id, slug, title").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!b) notFound();
  return <CheckoutView kind="bundle" id={b.id} slug={b.slug} title={b.title} coupon={sp.coupon} error={sp.error} backHref={`/bundles/${slug}`} />;
}
