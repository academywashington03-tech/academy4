import Link from "next/link";
export const metadata = { title: "غير مصرّح | Forbidden", robots: { index: false } };
export default function Forbidden() {
  return (
    <div className="container-x py-24 text-center">
      <h1 className="text-3xl font-bold text-navy-900">ليست لديك صلاحية لفتح هذه الصفحة</h1>
      <p className="mt-2 text-ink/70">You do not have permission to open this page.</p>
      <Link href="/" className="btn btn-navy mt-6">الرئيسية · Home</Link>
    </div>
  );
}
