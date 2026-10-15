import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getLang, t } from "@/lib/i18n";
import { safeHttpsUrl } from "@/lib/validation";

export const metadata: Metadata = { title: "تواصل معنا | Contact" };

// Contact details are entered by the administrator in Admin > Settings. Nothing is invented here.
export default async function Contact() {
  const lang = await getLang(); const d = t(lang);
  const { data: st } = isSupabaseConfigured() ? await (await createClient()).from("settings").select("value").eq("key", "public.academy").maybeSingle() : { data: null };
  const a = (st?.value ?? {}) as { contact_email?: string; contact_phone?: string; whatsapp?: string; facebook?: string; instagram?: string; youtube?: string };
  const socials = ([["Facebook", a.facebook], ["Instagram", a.instagram], ["YouTube", a.youtube]] as const).filter(([, u]) => u && safeHttpsUrl(u));
  const has = a.contact_email || a.contact_phone || a.whatsapp || socials.length > 0;
  return (
    <div className="container-x max-w-2xl py-12">
      <h1 className="text-4xl font-bold text-navy-900">{d.sections.contact}</h1>
      <p className="mt-3 text-ink/80">{d.contactText}</p>
      {has ? (
        <ul className="mt-6 divide-y divide-navy-900/10 rounded-lg border border-navy-900/15 bg-ivory-50 text-lg">
          {a.contact_email && <li className="p-4"><a className="underline" dir="ltr" href={`mailto:${a.contact_email}`}>{a.contact_email}</a></li>}
          {a.contact_phone && <li className="p-4"><a className="underline" dir="ltr" href={`tel:${a.contact_phone.replace(/[^+0-9]/g, "")}`}>{a.contact_phone}</a></li>}
          {a.whatsapp && <li className="p-4"><a className="underline" dir="ltr" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${a.whatsapp.replace(/[^0-9]/g, "")}`}>WhatsApp {a.whatsapp}</a></li>}
          {socials.map(([n, u]) => <li key={n} className="p-4"><a className="underline" target="_blank" rel="noopener noreferrer" href={u}>{n}</a></li>)}
        </ul>
      ) : <p role="status" className="mt-6 rounded-md border border-gold-500/50 bg-gold-300/20 p-4 text-sm">لم تُضف الإدارة بيانات التواصل بعد.</p>}
      <p className="mt-6 text-sm"><Link href="/#faq" className="text-navy-700 underline">{d.sections.faq}</Link></p>
    </div>
  );
}
