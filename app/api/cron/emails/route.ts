import { NextRequest, NextResponse } from "next/server";
import { sendPendingEmails } from "@/lib/outbox";
import { safeEqual } from "@/lib/secure-compare";

export const dynamic = "force-dynamic";

// Daily backlog sender (see vercel.json). Vercel Cron sends "Authorization: Bearer $CRON_SECRET".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await sendPendingEmails(100), { headers: { "Cache-Control": "no-store" } });
}
