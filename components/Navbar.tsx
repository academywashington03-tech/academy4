import Image from "next/image";
import Link from "next/link";
import { getLang, t } from "@/lib/i18n";
import { Icon } from "./Icons";
import NavMenu from "./NavMenu";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Navbar() {
  const lang = await getLang();
  const d = t(lang);
  const session = await getSessionProfile();
  const unread = session ? (await (await createClient()).from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.id).is("read_at", null)).count ?? 0 : 0;
  const other = lang === "ar" ? "en" : "ar";
  const links = [
    { href: "/", label: d.nav.home },
    { href: "/courses", label: d.nav.courses },
    { href: "/#benefits", label: d.nav.benefits },
    { href: "/#faq", label: d.nav.faq },
    { href: "/contact", label: d.nav.contact },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-gold-500/25 bg-navy-950/95 text-ivory-50 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3" aria-label={d.brand}>
          <Image src="/brand/logo-gold-mark.png" alt="" width={44} height={41} priority className="h-10 w-auto" />
          <span className="font-display text-xl text-gold-300">{d.brand}</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-ivory-100/85 hover:text-gold-300">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={`/api/lang?l=${other}`} className="px-2 py-2 text-sm text-gold-300 hover:text-gold-400" hrefLang={other}>{d.footer.switch}</a>
          {session && <Link href="/notifications" className="relative inline-flex h-11 min-w-[44px] items-center justify-center rounded-md px-2 text-sm text-gold-300" aria-label={lang === "ar" ? `الإشعارات (${unread} غير مقروء)` : `Notifications (${unread} unread)`}>🔔{unread > 0 && <span className="absolute -top-0 end-0 rounded-full bg-gold-500 px-1.5 text-xs font-bold text-navy-950">{unread > 99 ? "99+" : unread}</span>}</Link>}
          {session ? (
            <Link href="/dashboard" className="btn btn-gold hidden sm:inline-flex">{lang === "ar" ? "لوحتي" : "My dashboard"}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost-light hidden sm:inline-flex">{d.nav.login}</Link>
              <Link href="/register" className="btn btn-gold hidden sm:inline-flex">{d.nav.register}</Link>
            </>
          )}
          {/* Mobile menu: native <details> (works without JS) that closes itself after a link is tapped */}
          <NavMenu label={d.nav.menu} icon={<Icon name="menu" />}>
            <div className="absolute end-0 mt-2 w-64 rounded-lg border border-gold-500/30 bg-navy-900 p-2 shadow-xl">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded px-3 py-3 text-ivory-100 hover:bg-navy-700">{l.label}</Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-gold-500/20 p-2">
                {session ? (
                  <Link href="/dashboard" className="btn btn-gold col-span-2">{lang === "ar" ? "لوحتي" : "My dashboard"}</Link>
                ) : (
                  <>
                    <Link href="/login" className="btn btn-ghost-light">{d.nav.login}</Link>
                    <Link href="/register" className="btn btn-gold">{d.nav.register}</Link>
                  </>
                )}
              </div>
            </div>
          </NavMenu>
        </div>
      </div>
    </header>
  );
}
