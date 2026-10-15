import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getLang } from "@/lib/i18n";
import { paymobConfig } from "@/lib/paymob";
import { startOnlinePayment, startManualPayment } from "@/app/checkout/actions";
import { getSessionProfile } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";

const ERR: Record<string, string> = {
  not_configured: "الدفع الإلكتروني غير مفعّل بعد في هذا الموقع.", unavailable: "هذا العنصر غير متاح للشراء الآن.",
  gateway: "تعذّر الاتصال ببوابة الدفع. لم يُخصم أي مبلغ. حاول مرة أخرى.", profile: "أضف رقم هاتفك في إعدادات الحساب قبل الدفع.",
  coupon_invalid: "الكوبون غير صالح أو منتهٍ أو لا ينطبق على هذا العنصر.", coupon_used: "سبق أن استخدمت هذا الكوبون.", coupon_exhausted: "انتهى عدد استخدامات هذا الكوبون.",
  manual_payments_disabled: "الدفع اليدوي غير متاح حالياً.", rate: "محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة.",
};

export default async function CheckoutView(p: { kind: "course" | "bundle"; id: string; slug: string; title: string; coupon?: string; error?: string; backHref: string }) {
  const lang = await getLang();
  const sb = await createClient();
  const coupon = (p.coupon ?? "").trim().slice(0, 40);
  // Coupon guessing is throttled per user and IP (a plain price preview without a coupon is not limited).
  const me = coupon ? await getSessionProfile() : null;
  const throttled = !!coupon && !(await allow("coupon", 30, 600, me?.id ?? "anon"));
  const { data: q } = await sb.rpc("quote_item", { p_course: p.kind === "course" ? p.id : null, p_bundle: p.kind === "bundle" ? p.id : null, p_coupon: throttled ? null : coupon || null });
  const quote = (q as { subtotal: number; discount: number; total: number; currency: string; err: string | null }[] | null)?.[0];
  const { data: ms } = await sb.from("settings").select("value").eq("key", "public.manual_payments").maybeSingle();
  const manual = (ms?.value ?? {}) as { enabled?: boolean; instructions?: string };
  const online = !!paymobConfig();
  const fatal = !quote || quote.err === "unavailable";
  const couponErr = throttled ? "rate" : quote?.err && quote.err !== "unavailable" ? quote.err : null;
  const hidden = (<><input type="hidden" name="kind" value={p.kind} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="slug" value={p.slug} /><input type="hidden" name="coupon" value={couponErr ? "" : coupon} /></>);

  return (
    <div className="container-x max-w-xl py-10">
      <Link href={p.backHref} className="text-sm text-navy-700 underline">رجوع</Link>
      <h1 className="mb-5 mt-2 text-3xl font-bold text-navy-900">إتمام الشراء</h1>
      {(p.error || couponErr) && <p role="alert" className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-900">{ERR[couponErr ?? p.error ?? ""] ?? ERR.unavailable} {p.error === "profile" && <Link href="/settings" className="underline">الإعدادات</Link>}</p>}
      <div className="space-y-4 rounded-lg border border-navy-900/15 bg-ivory-50 p-5">
        <p className="font-semibold text-navy-900">{p.title}</p>
        {fatal ? <p className="text-sm">{ERR.unavailable}</p> : (
          <>
            <dl className="space-y-1 border-t border-navy-900/10 pt-3 text-sm">
              <div className="flex justify-between"><dt>السعر</dt><dd>{formatMoney(quote.subtotal, lang, quote.currency)}</dd></div>
              {quote.discount > 0 && <div className="flex justify-between text-emerald-800"><dt>الخصم ({coupon.toUpperCase()})</dt><dd>−{formatMoney(quote.discount, lang, quote.currency)}</dd></div>}
              <div className="flex items-baseline justify-between pt-1"><dt className="font-semibold">الإجمالي</dt><dd className="text-2xl font-bold text-navy-900">{formatMoney(quote.total, lang, quote.currency)}</dd></div>
            </dl>
            <form method="get" className="flex gap-2 border-t border-navy-900/10 pt-3">
              <input name="coupon" dir="ltr" defaultValue={coupon} placeholder="كوبون الخصم" aria-label="كوبون الخصم" className="min-h-[44px] flex-1 rounded-md border border-navy-900/30 bg-white px-3" />
              <button className="btn border border-navy-900/30">تطبيق</button>
            </form>
            <p className="text-xs text-ink/60">يُعاد حساب السعر والخصم في الخادم عند بدء الدفع.</p>
            <div className="space-y-3 border-t border-navy-900/10 pt-3">
              {online ? (
                <form action={startOnlinePayment}>{hidden}<button className="btn btn-gold w-full">ادفع إلكترونياً (بطاقة / محفظة عبر Paymob)</button>
                  <p className="mt-2 text-xs text-ink/60">لا نحفظ بيانات بطاقتك. تُفتح الدورة تلقائياً بعد أن يؤكد الخادم نجاح الدفع، وليس بمجرد عودتك للموقع.</p></form>
              ) : <p role="status" className="rounded-md bg-gold-300/25 p-3 text-sm">{ERR.not_configured}</p>}
              {manual.enabled && (
                <form action={startManualPayment}>{hidden}<button className="btn btn-navy w-full">الدفع بتحويل يدوي</button>
                  <p className="mt-2 text-xs text-ink/60">تُفتح الدورة بعد مراجعة الإدارة للتحويل واعتماده.</p></form>
              )}
              {!online && !manual.enabled && <p className="text-sm text-ink/70">لا توجد وسيلة دفع مفعّلة حالياً. تواصل مع الإدارة.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
