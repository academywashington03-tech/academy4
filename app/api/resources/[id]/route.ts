import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/course-validation";

// Access-checked download: every click re-verifies access, then redirects to a 60-second signed URL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname)}`, req.url));

  // RLS: only managers or enrolled students can read this row.
  const { data: r } = await sb.from("resources").select("storage_path, lesson_id, title").eq("id", id).maybeSingle();
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (r.lesson_id) {
    // Students must not reach files of unpublished lessons (RLS only returns published/accessible lessons).
    const { data: l } = await sb.from("lessons").select("id").eq("id", r.lesson_id).maybeSingle();
    if (!l) return new NextResponse("Not found", { status: 404 });
  }
  const download = req.nextUrl.searchParams.get("dl") === "1";
  const { data, error } = await sb.storage.from("course-resources").createSignedUrl(r.storage_path, 60, download ? { download: true } : undefined);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
