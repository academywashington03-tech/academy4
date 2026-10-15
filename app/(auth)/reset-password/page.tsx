import AuthShell, { inputCls } from "@/components/AuthShell";
import { getLang } from "@/lib/i18n";
import { at } from "@/lib/auth-text";
import { resetPassword } from "@/app/auth/actions";

export const metadata = { title: "كلمة مرور جديدة | New password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const a = at(await getLang());
  return (
    <AuthShell title={a.reset} error={sp.error}>
      <form action={resetPassword} className="space-y-4">
        <label className="block text-sm font-medium">{a.newPassword}
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
          <span className="mt-1 block text-xs text-ink/60">{a.passwordHint}</span>
        </label>
        <button className="btn btn-navy w-full">{a.save}</button>
      </form>
    </AuthShell>
  );
}
