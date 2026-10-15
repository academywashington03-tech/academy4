import { NextRequest, NextResponse, after } from "next/server";
import { sendPendingEmails } from "@/lib/outbox";
import { createServiceClient } from "@/lib/supabase/admin";
import { handlePaymobCallback, type Rpc } from "@/lib/payments/webhook";

export const dynamic = "force-dynamic";

// Paymob "Transaction processed callback" (server-to-server POST). The HMAC is in the ?hmac= query parameter.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rpc: Rpc = async (fn, args) => {
    const r = await createServiceClient().rpc(fn, args);
    return { data: r.data, error: r.error ? { message: r.error.message } : null };
  };
  const r = await handlePaymobCallback({ body, hmac: req.nextUrl.searchParams.get("hmac"), secret: process.env.PAYMOB_HMAC_SECRET, rpc });
  if (r.result === "fulfilled") after(() => sendPendingEmails(10));   // confirmation email; never blocks the webhook reply
  return NextResponse.json({ result: r.result }, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
