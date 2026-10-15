"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { prepareReceiptUpload, submitManualPayment } from "@/app/checkout/actions";
import { validateReceipt } from "@/lib/course-validation";

const ERR: Record<string, string> = {
  too_large: "الملف أكبر من 5 ميغابايت.", type: "الإيصال: صورة JPG/PNG أو PDF فقط.", empty: "الملف فارغ.", reference: "اكتب مرجع التحويل (3 أحرف على الأقل).",
  forbidden: "ليست لديك صلاحية.", rate: "محاولات كثيرة. انتظر قليلاً.", failed: "تعذّر الإرسال. حاول مرة أخرى.",
};

export default function ReceiptForm({ orderId, initialReference }: { orderId: string; initialReference?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState(initialReference ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (ref.trim().length < 3) { setMsg({ ok: false, text: ERR.reference }); return; }
    const f = file.current?.files?.[0];
    if (f) { const bad = validateReceipt(f.name, f.type, f.size); if (bad) { setMsg({ ok: false, text: ERR[bad] }); return; } }
    setBusy(true);
    try {
      let path: string | null = null;
      if (f) {
        const prep = await prepareReceiptUpload(orderId, f.name, f.type, f.size);
        if (!prep.ok) throw new Error(prep.error);
        const { error } = await createBrowserSupabase().storage.from("payment-receipts").uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type });
        if (error) throw new Error("failed");
        path = prep.path;
      }
      const r = await submitManualPayment(orderId, ref, path);
      if (!r.ok) throw new Error(r.error ?? "failed");
      setMsg({ ok: true, text: "تم إرسال بيانات الدفع. سنراجعها ونفعّل دورتك بعد الاعتماد." });
      router.refresh();
    } catch (err) { setMsg({ ok: false, text: ERR[(err as Error).message] ?? ERR.failed }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">مرجع التحويل (رقم العملية أو اسم المحوِّل)
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} required dir="ltr" className="mt-1 min-h-[44px] w-full rounded-md border border-navy-900/30 bg-white px-3 text-base" />
      </label>
      <label className="block text-sm font-medium">صورة الإيصال (اختياري، JPG / PNG / PDF حتى 5 ميغابايت)
        <input ref={file} type="file" accept="image/jpeg,image/png,application/pdf" className="mt-1 block w-full text-sm" />
      </label>
      <button disabled={busy} className="btn btn-gold w-full">{busy ? "جارٍ الإرسال…" : "إرسال للمراجعة"}</button>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-800" : "text-red-800"}`}>{msg.text}</p>}
    </form>
  );
}
