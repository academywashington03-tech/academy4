"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePath, type SessionProfile } from "@/lib/auth";
import { escapeLike } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import {
  UUID_RE, parseMoneyToMinor, parseVideoInput, sanitizeFileName, slugify, isValidSlug, validateCourseText, validateUpload,
} from "@/lib/course-validation";

// Every action: (1) re-checks the role on the server, (2) runs queries as the signed-in user so
// Row Level Security is the second lock, (3) writes an audit log entry for privileged changes.

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const id = (f: FormData, k: string) => { const v = str(f, k); if (!UUID_RE.test(v)) redirect("/admin?error=bad_request"); return v; };
const isAdmin = (s: SessionProfile) => s.role === "super_admin";
function go(path: string, key: "ok" | "error", code: string): never {
  return redirect(`${path}?${key}=${code}`);
}

async function ctx(path = "/admin/courses") {
  const s = await requirePath(path);
  return { s, sb: await createClient() };
}
async function canManage(sb: SupabaseClient, courseId: string) {
  const { data } = await sb.rpc("manages_course", { cid: courseId });
  return data === true;
}
async function audit(sb: SupabaseClient, action: string, entity: string, entityId: string, details?: object) {
  await sb.rpc("log_audit", { p_action: action, p_entity: entity, p_entity_id: entityId, p_details: details ?? null });
}
const editPath = (courseId: string) => `/admin/courses/${courseId}`;

// ---------------- Courses ----------------
export async function createCourse(form: FormData) {
  const { s, sb } = await ctx("/admin/courses/new");
  if (!isAdmin(s)) redirect("/forbidden");
  const t = validateCourseText({ title: str(form, "title") });
  if (!t.ok) go("/admin/courses/new", "error", "title");
  const isFree = str(form, "pricing") === "free";
  const price = isFree ? 0 : parseMoneyToMinor(str(form, "price"));
  if (price === null || (!isFree && price <= 0)) go("/admin/courses/new", "error", "price");
  const title = str(form, "title").trim();
  const base = slugify(title) || "course";
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 && base.length >= 3 ? base : `${base}-${randomUUID().slice(0, 6)}`;
    const { data, error } = await sb.from("courses")
      .insert({ title, slug, is_free: isFree, price_minor: price, status: "draft", instructor_id: null })
      .select("id").single();
    if (!error && data) { await audit(sb, "course_created", "course", data.id, { title }); redirect(editPath(data.id)); }
    if (error?.code !== "23505") break; // only retry on duplicate slug
  }
  return go("/admin/courses/new", "error", "failed");
}

export async function updateCourse(form: FormData) {
  const { s, sb } = await ctx();
  const courseId = id(form, "id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const t = validateCourseText({
    title: str(form, "title"), short_description: str(form, "short_description"), description: str(form, "description"),
    level: str(form, "level"), language: str(form, "language"), duration_minutes: str(form, "duration_minutes"),
    access_days: str(form, "access_days"), pass_score: str(form, "pass_score"), objectives: str(form, "objectives"),
    prerequisites: str(form, "prerequisites"),
  });
  if (!t.ok) go(editPath(courseId), "error", t.errors[0]);
  const patch: Record<string, unknown> = { ...(t as { clean: object }).clean, certificate_enabled: form.get("certificate_enabled") === "on" };

  if (isAdmin(s)) {
    const isFree = str(form, "pricing") === "free";
    const price = isFree ? 0 : parseMoneyToMinor(str(form, "price"));
    if (price === null || (!isFree && price <= 0)) go(editPath(courseId), "error", "price");
    const promoRaw = str(form, "promo_price").trim();
    const promo = promoRaw ? parseMoneyToMinor(promoRaw) : null;
    if (promoRaw && (promo === null || promo <= 0 || promo >= (price as number))) go(editPath(courseId), "error", "promo");
    const slug = str(form, "slug").trim().toLowerCase();
    if (!isValidSlug(slug)) go(editPath(courseId), "error", "slug");
    const cat = str(form, "category_id"); const ins = str(form, "instructor_id");
    Object.assign(patch, {
      is_free: isFree, price_minor: price, promo_price_minor: isFree ? null : promo, slug,
      enrollment_open: form.get("enrollment_open") === "on",
      category_id: UUID_RE.test(cat) ? cat : null, instructor_id: UUID_RE.test(ins) ? ins : null,
    });
  }
  const { error } = await sb.from("courses").update(patch).eq("id", courseId);
  if (error) go(editPath(courseId), "error", error.code === "23505" ? "slug_taken" : "failed");
  await audit(sb, "course_updated", "course", courseId, { fields: Object.keys(patch) });
  revalidatePath(editPath(courseId));
  go(editPath(courseId), "ok", "saved");
}

export async function setCourseStatus(form: FormData) {
  const { s, sb } = await ctx();
  if (!isAdmin(s)) redirect("/forbidden");
  const courseId = id(form, "id");
  const status = str(form, "status");
  if (!["draft", "published", "archived"].includes(status)) go(editPath(courseId), "error", "failed");
  if (status === "published") {
    const { data: c } = await sb.from("courses").select("title, slug, is_free, price_minor").eq("id", courseId).single();
    const { count } = await sb.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", courseId).eq("published", true);
    if (!c || !c.title || !isValidSlug(c.slug) || (!c.is_free && c.price_minor <= 0)) go(editPath(courseId), "error", "not_ready");
    if (!count) go(editPath(courseId), "error", "no_published_lessons");
  }
  const { error } = await sb.from("courses").update({ status }).eq("id", courseId);
  if (error) go(editPath(courseId), "error", "failed");
  await audit(sb, "course_status", "course", courseId, { status });
  revalidatePath("/courses"); revalidatePath(editPath(courseId));
  go(editPath(courseId), "ok", status);
}

export async function duplicateCourse(form: FormData) {
  const { s, sb } = await ctx();
  if (!isAdmin(s)) redirect("/forbidden");
  const courseId = id(form, "id");
  const { data: c } = await sb.from("courses").select("*").eq("id", courseId).single();
  if (!c) go("/admin/courses", "error", "failed");
  const { id: _old, created_at: _c, updated_at: _u, ...rest } = c as Record<string, unknown>;
  void _old; void _c; void _u;
  const { data: nc, error } = await sb.from("courses")
    .insert({ ...rest, title: `${c!.title} (نسخة)`, slug: `${String(c!.slug).slice(0, 60)}-${randomUUID().slice(0, 6)}`, status: "draft" })
    .select("id").single();
  if (error || !nc) go(editPath(courseId), "error", "failed");
  const { data: secs } = await sb.from("sections").select("*").eq("course_id", courseId).order("sort_order");
  for (const sec of secs ?? []) {
    const { data: ns } = await sb.from("sections").insert({ course_id: nc!.id, title: sec.title, sort_order: sec.sort_order }).select("id").single();
    const { data: ls } = await sb.from("lessons").select("*").eq("section_id", sec.id).order("sort_order");
    if (ns && ls?.length) {
      await sb.from("lessons").insert(ls.map((l) => ({
        section_id: ns.id, course_id: nc!.id, title: l.title, description: l.description, type: l.type,
        video_provider: l.video_provider, video_ref: l.video_ref, body: l.body, is_free_preview: l.is_free_preview,
        required_for_completion: l.required_for_completion, published: false, sort_order: l.sort_order,
      })));
    }
  }
  await audit(sb, "course_duplicated", "course", nc!.id, { from: courseId });
  go(editPath(nc!.id), "ok", "duplicated"); // files/resources are not copied; lessons start unpublished
}

export async function deleteCourse(form: FormData) {
  const { s, sb } = await ctx();
  if (!isAdmin(s)) redirect("/forbidden");
  const courseId = id(form, "id");
  const { count } = await sb.from("enrollments").select("user_id", { count: "exact", head: true }).eq("course_id", courseId);
  if (count) go(editPath(courseId), "error", "has_students"); // never delete a course that students own; archive it
  const { error } = await sb.from("courses").delete().eq("id", courseId);
  if (error) go(editPath(courseId), "error", "failed");
  await audit(sb, "course_deleted", "course", courseId);
  go("/admin/courses", "ok", "deleted");
}

// ---------------- Sections & lessons ----------------
async function renumber(sb: SupabaseClient, table: "sections" | "lessons", filterCol: string, filterVal: string, targetId: string, dir: "up" | "down") {
  const { data } = await sb.from(table).select("id").eq(filterCol, filterVal).order("sort_order").order("id");
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(targetId); const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) await sb.from(table).update({ sort_order: k }).eq("id", ids[k]);
}

export async function addSection(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const title = str(form, "title").trim().slice(0, 150);
  if (title.length < 2) go(editPath(courseId), "error", "title");
  const { count } = await sb.from("sections").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await sb.from("sections").insert({ course_id: courseId, title, sort_order: count ?? 0 });
  if (error) go(editPath(courseId), "error", "failed");
  await audit(sb, "section_added", "course", courseId, { title });
  go(editPath(courseId), "ok", "section_added");
}
export async function renameSection(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id"); const sid = id(form, "section_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const title = str(form, "title").trim().slice(0, 150);
  if (title.length < 2) go(editPath(courseId), "error", "title");
  await sb.from("sections").update({ title }).eq("id", sid).eq("course_id", courseId);
  go(editPath(courseId), "ok", "saved");
}
export async function moveSection(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  await renumber(sb, "sections", "course_id", courseId, id(form, "section_id"), str(form, "dir") === "up" ? "up" : "down");
  go(editPath(courseId), "ok", "moved");
}
export async function deleteSection(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const sid = id(form, "section_id");
  await sb.from("sections").delete().eq("id", sid).eq("course_id", courseId);
  await audit(sb, "section_deleted", "section", sid, { courseId });
  go(editPath(courseId), "ok", "deleted");
}

export async function addLesson(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id"); const sid = id(form, "section_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const title = str(form, "title").trim().slice(0, 150);
  const type = str(form, "type");
  if (title.length < 2) go(editPath(courseId), "error", "title");
  if (!["video", "pdf", "text", "quiz", "resource"].includes(type)) go(editPath(courseId), "error", "failed");
  const { count } = await sb.from("lessons").select("id", { count: "exact", head: true }).eq("section_id", sid);
  const { data, error } = await sb.from("lessons")
    .insert({ course_id: courseId, section_id: sid, title, type, sort_order: count ?? 0, published: false }).select("id").single();
  if (error || !data) go(editPath(courseId), "error", "failed");
  await audit(sb, "lesson_added", "lesson", data!.id, { courseId, title });
  redirect(`${editPath(courseId)}/lessons/${data!.id}`);
}

export async function updateLesson(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id"); const lid = id(form, "lesson_id");
  const back = `${editPath(courseId)}/lessons/${lid}`;
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const title = str(form, "title").trim().slice(0, 150);
  if (title.length < 2) go(back, "error", "title");
  const { data: cur } = await sb.from("lessons").select("type").eq("id", lid).eq("course_id", courseId).single();
  if (!cur) go(editPath(courseId), "error", "failed");
  const patch: Record<string, unknown> = {
    title, description: str(form, "description").trim().slice(0, 2000), body: str(form, "body").slice(0, 50000),
    is_free_preview: form.get("is_free_preview") === "on", required_for_completion: form.get("required_for_completion") === "on",
  };
  if (cur!.type === "video") {
    const raw = str(form, "video_ref").trim();
    if (raw) {
      const v = parseVideoInput(str(form, "video_provider"), raw);
      if (!v) go(back, "error", "video");
      patch.video_provider = v!.provider; patch.video_ref = v!.ref;
    } else { patch.video_provider = null; patch.video_ref = null; }
  }
  const wantPublish = form.get("published") === "on";
  if (wantPublish) {
    if (cur!.type === "video" && !patch.video_ref) go(back, "error", "need_video");
    if (cur!.type === "text" && !String(patch.body).trim()) go(back, "error", "need_body");
    if (cur!.type === "quiz") {
      const { data: qz } = await sb.from("quizzes").select("id").eq("lesson_id", lid).maybeSingle();
      const { count } = qz ? await sb.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", qz.id) : { count: 0 };
      if (!count) go(back, "error", "need_questions");
    }
    if (cur!.type === "pdf" || cur!.type === "resource") {
      const { count } = await sb.from("resources").select("id", { count: "exact", head: true }).eq("lesson_id", lid);
      if (!count) go(back, "error", "need_file");
    }
  }
  patch.published = wantPublish;
  const { error } = await sb.from("lessons").update(patch).eq("id", lid).eq("course_id", courseId);
  if (error) go(back, "error", "failed");
  await audit(sb, "lesson_updated", "lesson", lid, { published: wantPublish });
  go(back, "ok", "saved");
}
export async function moveLesson(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  await renumber(sb, "lessons", "section_id", id(form, "section_id"), id(form, "lesson_id"), str(form, "dir") === "up" ? "up" : "down");
  go(editPath(courseId), "ok", "moved");
}
export async function deleteLesson(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id"); const lid = id(form, "lesson_id");
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  await sb.from("lessons").delete().eq("id", lid).eq("course_id", courseId);
  await audit(sb, "lesson_deleted", "lesson", lid, { courseId });
  go(editPath(courseId), "ok", "deleted");
}

// ---------------- Uploads (browser -> Supabase Storage directly, with server-issued signed token) ----------------
export type PrepareResult = { ok: true; path: string; token: string; bucket: string } | { ok: false; error: string };

export async function prepareUpload(kind: "resource" | "cover", courseId: string, fileName: string, mime: string, size: number): Promise<PrepareResult> {
  const { sb } = await ctx();
  if (!UUID_RE.test(courseId) || !(await canManage(sb, courseId))) return { ok: false, error: "forbidden" };
  const problem = validateUpload(kind, fileName, mime, size);
  if (problem) return { ok: false, error: problem };
  const bucket = kind === "cover" ? "course-covers" : "course-resources";
  const path = `${courseId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, path, token: data.token, bucket };
}

export async function registerUpload(kind: "resource" | "cover", courseId: string, lessonId: string | null, path: string, displayName: string) {
  const { sb } = await ctx();
  if (!UUID_RE.test(courseId) || !(await canManage(sb, courseId)) || !path.startsWith(`${courseId}/`)) return { ok: false as const, error: "forbidden" };
  const bucket = kind === "cover" ? "course-covers" : "course-resources";
  const file = path.slice(courseId.length + 1);
  // Confirm the object really exists and read its REAL size/type from storage (not from the browser).
  const { data: found } = await sb.storage.from(bucket).list(courseId, { search: file, limit: 1 });
  const obj = found?.find((o) => o.name === file);
  const meta = obj?.metadata as { size?: number; mimetype?: string } | undefined;
  if (!obj || !meta?.size || !meta.mimetype) return { ok: false as const, error: "missing" };
  if (kind === "cover") {
    const url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    await sb.from("courses").update({ cover_url: url }).eq("id", courseId);
    await audit(sb, "cover_uploaded", "course", courseId);
  } else {
    const lid = lessonId && UUID_RE.test(lessonId) ? lessonId : null;
    const { error } = await sb.from("resources").insert({
      course_id: courseId, lesson_id: lid, title: displayName.slice(0, 150) || "ملف", storage_path: path, mime_type: meta.mimetype, size_bytes: meta.size,
    });
    if (error) { await sb.storage.from(bucket).remove([path]); return { ok: false as const, error: "failed" }; }
    await audit(sb, "resource_uploaded", "course", courseId, { path, size: meta.size });
  }
  return { ok: true as const };
}

export async function deleteResource(form: FormData) {
  const { sb } = await ctx(); const courseId = id(form, "course_id"); const rid = id(form, "resource_id");
  const back = str(form, "back") || editPath(courseId);
  if (!(await canManage(sb, courseId))) redirect("/forbidden");
  const { data: r } = await sb.from("resources").select("storage_path").eq("id", rid).eq("course_id", courseId).single();
  if (r) { await sb.storage.from("course-resources").remove([r.storage_path]); await sb.from("resources").delete().eq("id", rid); }
  await audit(sb, "resource_deleted", "resource", rid, { courseId });
  go(back.startsWith("/admin/") ? back : editPath(courseId), "ok", "deleted");
}

// ---------------- Categories (admin) ----------------
export async function saveCategory(form: FormData) {
  const { s, sb } = await ctx("/admin/categories");
  if (!isAdmin(s)) redirect("/forbidden");
  const name = str(form, "name_ar").trim().slice(0, 80); const nameEn = str(form, "name_en").trim().slice(0, 80);
  const slug = (str(form, "slug").trim().toLowerCase()) || slugify(nameEn);
  if (name.length < 2 || !isValidSlug(slug)) go("/admin/categories", "error", "invalid");
  const { error } = await sb.from("categories").insert({ name_ar: name, name_en: nameEn || null, slug });
  if (error) go("/admin/categories", "error", error.code === "23505" ? "slug_taken" : "failed");
  await audit(sb, "category_created", "category", slug);
  go("/admin/categories", "ok", "saved");
}
export async function deleteCategory(form: FormData) {
  const { s, sb } = await ctx("/admin/categories");
  if (!isAdmin(s)) redirect("/forbidden");
  const cid = id(form, "id");
  await sb.from("categories").delete().eq("id", cid);
  await audit(sb, "category_deleted", "category", cid);
  go("/admin/categories", "ok", "deleted");
}

// ---------------- Instructors (admin) ----------------
export async function setInstructorRole(form: FormData) {
  const { s, sb } = await ctx("/admin/instructors");
  if (!isAdmin(s)) redirect("/forbidden");
  const email = str(form, "email").trim().toLowerCase();
  const role = str(form, "role") === "student" ? "student" : "instructor";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) go("/admin/instructors", "error", "email");
  const { data: p } = await sb.from("profiles").select("id, role").ilike("email", escapeLike(email)).maybeSingle();   // "_" and "%" are legal in e-mail local parts: match literally
  if (!p) go("/admin/instructors", "error", "not_found"); // the person must register first
  if (p!.role === "super_admin") go("/admin/instructors", "error", "protected"); // never change an admin here
  const { error } = await sb.from("profiles").update({ role }).eq("id", p!.id);
  if (error) go("/admin/instructors", "error", "failed");
  await audit(sb, "role_changed", "profile", p!.id, { role });
  go("/admin/instructors", "ok", role);
}
