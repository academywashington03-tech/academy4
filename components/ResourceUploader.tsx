"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { prepareUpload, registerUpload } from "@/app/admin/actions";
import { validateUpload } from "@/lib/course-validation";

const ERR: Record<string, string> = {
  too_large: "الملف أكبر من الحد المسموح.", type: "نوع الملف غير مسموح.", empty: "الملف فارغ.", forbidden: "ليست لديك صلاحية.",
  missing: "لم يكتمل الرفع. حاول مرة أخرى.", failed: "تعذّر الرفع. حاول مرة أخرى.",
};

export default function ResourceUploader({ kind, courseId, lessonId, label }: { kind: "resource" | "cover"; courseId: string; lessonId?: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function onPick() {
    const f = input.current?.files?.[0];
    if (!f) return;
    setMsg(null);
    const early = validateUpload(kind, f.name, f.type, f.size); // fast feedback; the server re-validates
    if (early) { setMsg({ ok: false, text: ERR[early] }); return; }
    setState("busy");
    try {
      const prep = await prepareUpload(kind, courseId, f.name, f.type, f.size);
      if (!prep.ok) throw new Error(prep.error);
      const { error } = await createBrowserSupabase().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type });
      if (error) throw new Error("failed");
      const done = await registerUpload(kind, courseId, lessonId ?? null, prep.path, f.name);
      if (!done.ok) throw new Error(done.error);
      setMsg({ ok: true, text: "تم رفع الملف." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: ERR[(e as Error).message] ?? ERR.failed });
    } finally {
      setState("idle");
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <label className="btn btn-navy cursor-pointer">
        {state === "busy" ? "جارٍ الرفع… لا تغلق الصفحة" : label}
        <input ref={input} type="file" className="sr-only" disabled={state === "busy"} onChange={onPick}
          accept={kind === "cover" ? "image/jpeg,image/png,image/webp" : ".pdf,.docx,.pptx,.xlsx,.zip,.jpg,.jpeg,.png"} />
      </label>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-emerald-800" : "text-red-800"}`}>{msg.text}</p>}
    </div>
  );
}
