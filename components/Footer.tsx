import Image from "next/image";
import Link from "next/link";
import { getLang, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeHttpsUrl } from "@/lib/validation";

export default async function Footer() {
  const lang = await getLang();
  const d = t(lang);
  const { data: st } = isSupabaseConfigured() ? await (await createClient()).from("settings").select("value").eq("key", "public.academy").maybeSingle() : { data: null };
  const a = (st?.value ?? {}) as { name?: string; contact_email?: string; contact_phone?: string; whatsapp?: string; facebook?: string; instagram?: string; youtube?: string };
  const socials = ([["Facebook", a.facebook], ["Instagram", a.instagram], ["YouTube", a.youtube]] as const).filter(([, u]) => u && safeHttpsUrl(u));
  return (
    <footer className="bg-navy-950 text-ivory-100/80">
      <div className="container-x grid gap-8 py-12 md:grid-cols-[1.2fr_1fr]">
        <div className="flex items-start gap-4">
          <Image src="/brand/logo-gold-mark.png" alt="" width={64} height={60} className="h-14 w-auto" />
          <div>
            <p className="font-display text-xl text-gold-300">{d.brand}</p>
            <p className="mt-1 text-sm">{d.tagline}</p>
          </div>
        </div>
        <div>
          {(a.contact_email || a.contact_phone || a.whatsapp || socials.length > 0) && (
            <ul className="mb-5 space-y-1 text-sm">
              {a.contact_email && <li><a className="hover:text-gold-300" href={`mailto:${a.contact_email}`} dir="ltr">{a.contact_email}</a></li>}
              {a.contact_phone && <li><a className="hover:text-gold-300" href={`tel:${a.contact_phone.replace(/[^+0-9]/g, "")}`} dir="ltr">{a.contact_phone}</a></li>}
              {a.whatsapp && <li><a className="hover:text-gold-300" href={`https://wa.me/${a.whatsapp.replace(/[^0-9]/g, "")}`} rel="noopener noreferrer" target="_blank" dir="ltr">WhatsApp {a.whatsapp}</a></li>}
              {socials.length > 0 && <li className="flex gap-4 pt-1">{socials.map(([n, u]) => <a key={n} className="hover:text-gold-300" href={u} rel="noopener noreferrer" target="_blank">{n}</a>)}</li>}
            </ul>
          )}
          <p className="mb-3 font-semibold text-gold-300">{d.footer.policies}</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/contact" className="hover:text-gold-300">{d.nav.contact}</Link></li>
            <li><Link href="/policy/privacy" className="hover:text-gold-300">{d.footer.privacy}</Link></li>
            <li><Link href="/policy/terms" className="hover:text-gold-300">{d.footer.terms}</Link></li>
            <li><Link href="/policy/refund" className="hover:text-gold-300">{d.footer.refund}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gold-500/20 py-4 text-center text-xs">
        © {new Date().getFullYear()} {d.brand}. {d.footer.rights}
      </div>
    </footer>
  );
}
