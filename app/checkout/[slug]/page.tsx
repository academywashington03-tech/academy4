import { notFound, redirect } from "next/navigation";
import { requirePath } from "@/lib/auth";
import { getCourse } from "@/lib/courses";
import CheckoutView from "@/components/CheckoutView";

export const metadata = { title: "إتمام الشراء | Checkout", robots: { index: false, follow: false } };

export default async function Checkout({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; coupon?: string }> }) {
  const { slug } = await params; const sp = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  await requirePath(`/checkout/${slug}`);
  const c = await getCourse(slug);
  if (!c) notFound();
  if (c.isFree) redirect(`/courses/${slug}`);
  return <CheckoutView kind="course" id={c.id} slug={c.slug} title={c.title} coupon={sp.coupon} error={sp.error} backHref={`/courses/${slug}`} />;
}
