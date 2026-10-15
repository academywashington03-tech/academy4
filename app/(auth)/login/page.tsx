import Link from "next/link";
import AuthShell, { inputCls } from "@/components/AuthShell";
import { getLang } from "@/lib/i18n";
import { at } from "@/lib/auth-text";
import { login, loginWithGoogle } from "@/app/auth/actions";
import { safeNext } from "@/lib/validation";

export const metadata = { title: "تسجيل الدخول | Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; next?: string }> }) {
  const sp = await searchParams;
  const a = at(await getLang());
  return (
    <AuthShell title={a.login} error={sp.error} notice={sp.notice}>
      <form action={login} className="space-y-4">
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <label className="block text-sm font-medium">{a.email}
          <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">{a.password}
          <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
        </label>
        <button className="btn btn-navy w-full">{a.login}</button>
      </form>
      <p className="mt-4 text-sm"><Link href="/forgot-password" className="text-navy-700 underline">{a.forgot}</Link></p>
      {process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1" && (
        <form action={loginWithGoogle} className="mt-4"><button className="btn w-full border border-navy-900/30">{a.google}</button></form>
      )}
      <p className="mt-5 text-sm">{a.noAccount} <Link href="/register" className="font-semibold text-navy-700 underline">{a.register}</Link></p>
    </AuthShell>
  );
}
