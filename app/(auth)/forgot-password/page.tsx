import AuthShell, { inputCls } from "@/components/AuthShell";
import { getLang } from "@/lib/i18n";
import { at } from "@/lib/auth-text";
import { forgotPassword } from "@/app/auth/actions";

export const metadata = { title: "استعادة كلمة المرور | Reset password", robots: { index: false } };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const a = at(await getLang());
  return (
    <AuthShell title={a.forgot} notice={sp.notice}>
      <form action={forgotPassword} className="space-y-4">
        <label className="block text-sm font-medium">{a.email}
          <input name="email" type="email" required autoComplete="email" inputMode="email" className={inputCls} />
        </label>
        <button className="btn btn-navy w-full">{a.sendLink}</button>
      </form>
    </AuthShell>
  );
}
