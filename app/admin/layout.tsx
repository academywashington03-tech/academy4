import { requirePath } from "@/lib/auth";
import { AdminNav } from "@/components/AdminUI";

export const metadata = { robots: { index: false, follow: false } };

// Authoritative server-side gate: role is read from the database, not from the browser.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePath("/admin");
  return (<><AdminNav role={s.role} />{children}</>);
}
