import Image from "next/image";
import { getLang } from "@/lib/i18n";
import { at } from "@/lib/auth-text";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AuthShell({ title, error, notice, children }: { title: string; error?: string; notice?: string; children: React.ReactNode }) {
  const lang = await getLang();
  const a = at(lang);
  const errMsg = error ? (a.errors as Record<string, string>)[error] ?? a.errors.failed : null;
  const noteMsg = notice ? (a.notices as Record<string, string>)[notice] : null;
  return (
    <div className="bg-navy-950 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="mb-6 flex justify-center"><Image src="/brand/logo-gold-full.png" alt="Washington Academy" width={220} height={144} priority className="h-28 w-auto" /></div>
        <div className="rounded-xl border border-gold-500/40 bg-ivory-50 p-6 sm:p-8">
          <h1 className="mb-5 text-3xl font-bold text-navy-900">{title}</h1>
          {!isSupabaseConfigured() && <p role="alert" className="mb-4 rounded-md bg-gold-300/30 p-3 text-sm">{a.notConfigured}</p>}
          {errMsg && <p role="alert" className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-900">{errMsg}</p>}
          {noteMsg && <p role="status" className="mb-4 rounded-md bg-emerald-100 p-3 text-sm text-emerald-900">{noteMsg}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export const inputCls = "mt-1 min-h-[44px] w-full rounded-md border border-navy-900/30 bg-white px-3 text-base";
