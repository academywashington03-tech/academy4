import Link from "next/link";
import AuthShell, { inputCls } from "@/components/AuthShell";
import { getLang } from "@/lib/i18n";
import { at } from "@/lib/auth-text";
import { register } from "@/app/auth/actions";

export const metadata = { title: "إنشاء حساب | Register", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const a = at(await getLang());
  return (
    <AuthShell title={a.register} error={sp.error}>
      <form action={register} className="space-y-4">
        <label className="block text-sm font-medium">{a.name}
          <input name="fullName" required minLength={3} maxLength={100} autoComplete="name" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">{a.email}
          <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">{a.phone}
          <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" dir="ltr" placeholder={a.phoneHint} className={inputCls} />
        </label>
        <label className="block text-sm font-medium">{a.password}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          <span className="mt-1 block text-xs text-ink/60">{a.passwordHint}</span>
        </label>
        <button className="btn btn-gold w-full">{a.register}</button>
      </form>
      <p className="mt-5 text-sm">{a.haveAccount} <Link href="/login" className="font-semibold text-navy-700 underline">{a.login}</Link></p>
    </AuthShell>
  );
}
