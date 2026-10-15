import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
const LIMIT = 20000;
/* eslint-disable @typescript-eslint/no-explicit-any */

// CSV exports contain personal data: super_admin only (checked on the server), runs as the admin so RLS applies, and is audited.
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const s = await getSessionProfile();
  if (!s || s.suspended || s.role !== "super_admin") return new NextResponse("Forbidden", { status: 403 });
  const sb = await createClient();
  const d = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
  let name = kind, csv = "";

  if (kind === "students") {
    const { data } = await sb.from("profiles").select("full_name, email, phone, role, suspended, created_at").order("created_at", { ascending: false }).limit(LIMIT);
    csv = toCsv([{ key: "full_name", label: "الاسم" }, { key: "email", label: "البريد" }, { key: "phone", label: "الهاتف" }, { key: "role", label: "الدور" }, { key: "suspended", label: "موقوف" }, { key: "created_at", label: "تاريخ التسجيل" }],
      (data ?? []).map((r) => ({ ...r, created_at: d(r.created_at) })));
  } else if (kind === "enrollments") {
    const { data } = await sb.from("enrollments").select("source, created_at, expires_at, revoked_at, profiles(full_name, email), courses(title)").order("created_at", { ascending: false }).limit(LIMIT);
    csv = toCsv([{ key: "student", label: "الطالب" }, { key: "email", label: "البريد" }, { key: "course", label: "الدورة" }, { key: "source", label: "المصدر" }, { key: "created_at", label: "تاريخ التسجيل" }, { key: "expires_at", label: "ينتهي" }, { key: "revoked_at", label: "سُحب في" }],
      ((data ?? []) as any[]).map((r) => ({ student: r.profiles?.full_name, email: r.profiles?.email, course: r.courses?.title, source: r.source, created_at: d(r.created_at), expires_at: d(r.expires_at), revoked_at: d(r.revoked_at) })));
  } else if (kind === "orders" || kind === "refunds") {
    let q = sb.from("orders").select("id, created_at, method, status, total_minor, subtotal_minor, discount_minor, currency, provider_ref, manual_reference, profiles!orders_user_id_fkey(full_name, email), courses(title), bundles(title), payment_transactions(provider_txn_id, outcome)").order("created_at", { ascending: false }).limit(LIMIT);
    q = kind === "refunds" ? q.eq("status", "refunded") : q.in("status", ["paid", "refunded"]);
    const { data } = await q;
    csv = toCsv([{ key: "id", label: "رقم الطلب" }, { key: "created_at", label: "التاريخ" }, { key: "student", label: "الطالب" }, { key: "email", label: "البريد" }, { key: "item", label: "العنصر" }, { key: "method", label: "الطريقة" }, { key: "status", label: "الحالة" },
      { key: "subtotal", label: "السعر" }, { key: "discount", label: "الخصم" }, { key: "total", label: "الإجمالي" }, { key: "currency", label: "العملة" }, { key: "ref", label: "مرجع العملية" }],
      ((data ?? []) as any[]).map((o) => ({ id: o.id, created_at: d(o.created_at), student: o.profiles?.full_name, email: o.profiles?.email, item: o.courses?.title ?? o.bundles?.title, method: o.method, status: o.status,
        subtotal: o.subtotal_minor / 100, discount: o.discount_minor / 100, total: o.total_minor / 100, currency: o.currency,
        ref: o.method === "manual" ? o.manual_reference : (o.payment_transactions ?? []).map((t: any) => t.provider_txn_id).join(" | ") })));
  } else if (kind === "reconciliation") {
    const { data } = await sb.rpc("admin_reconciliation");
    csv = toCsv([{ key: "issue", label: "المشكلة" }, { key: "order_id", label: "المعرّف" }, { key: "detail", label: "التفاصيل" }], (data ?? []) as any[]);
  } else if (kind === "courses") {
    const { data } = await sb.rpc("admin_course_performance");
    csv = toCsv([{ key: "title", label: "الدورة" }, { key: "enrollments", label: "التسجيلات" }, { key: "active", label: "النشطة" }, { key: "completed", label: "المكتملون" }, { key: "paid_orders", label: "الطلبات المدفوعة" }, { key: "revenue", label: "الإيراد (ج.م)" }, { key: "refunded_orders", label: "المستردة" }],
      ((data ?? []) as any[]).map((r) => ({ ...r, revenue: Number(r.revenue_minor) / 100 })));
  } else return new NextResponse("Not found", { status: 404 });

  await sb.rpc("log_audit", { p_action: "report_exported", p_entity: "report", p_entity_id: kind, p_details: null });
  name = `washington-academy-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
