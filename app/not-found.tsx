import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <h1 className="text-4xl font-bold text-navy-900">404</h1>
      <p className="mt-3 text-ink/70">الصفحة غير موجودة · Page not found</p>
      <Link href="/" className="btn btn-navy mt-6">الرئيسية · Home</Link>
    </div>
  );
}
