import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_POLICIES, POLICY_TITLES, isPolicyKind, policyKey } from "@/lib/policies";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return isPolicyKind(slug) ? { title: POLICY_TITLES[slug] } : {};
}

// Shows the text approved by the administrator (Admin > Settings). Until then a general template is shown with a clear notice.
export default async function Policy({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isPolicyKind(slug)) notFound();
  let saved: string | null = null;
  if (isSupabaseConfigured()) {
    const { data } = await (await createClient()).from("settings").select("value").eq("key", policyKey(slug)).maybeSingle();
    const t = (data?.value as { text?: string } | undefined)?.text;
    if (t && t.trim()) saved = t;
  }
  return (
    <div className="container-x max-w-3xl py-12">
      <h1 className="text-4xl font-bold text-navy-900">{POLICY_TITLES[slug]}</h1>
      {!saved && <p className="mt-4 rounded-md border border-gold-500/50 bg-gold-300/20 p-3 text-sm">نص عام مبني على طريقة عمل المنصة، ولم تعتمده إدارة الأكاديمية بعد.</p>}
      <div className="mt-6 whitespace-pre-line leading-8 text-ink/90">{saved ?? DEFAULT_POLICIES[slug]}</div>
    </div>
  );
}
