"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-x py-24 text-center" role="alert">
      <h1 className="text-3xl font-bold text-navy-900">حدث خطأ غير متوقع</h1>
      <p className="mt-2 text-ink/70">لم يحدث أي خصم أو تغيير غير مكتمل. حاول مرة أخرى، وإن استمرت المشكلة تواصل معنا.<br /><span dir="ltr" className="text-sm">Something went wrong. Please try again.</span></p>
      <div className="mt-6 flex justify-center gap-3"><button onClick={reset} className="btn btn-gold">إعادة المحاولة</button><Link href="/" className="btn border border-navy-900/30">الرئيسية</Link></div>
    </div>
  );
}
