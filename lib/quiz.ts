// Pure helpers for quizzes/certificates (unit-tested with `node --test`).
import { UUID_RE } from "./course-validation.ts";

export type QuestionDraft = { kind: "mcq" | "true_false"; prompt: string; explanation: string; options: string[]; correct: number };

/** Parses the admin "add question" form. Returns an error code or the clean draft. */
export function parseQuestionForm(f: { kind?: string; prompt?: string; explanation?: string; options?: string; correct?: string; tf?: string }, labels = { t: "صح", f: "خطأ" }): { ok: true; draft: QuestionDraft } | { ok: false; error: string } {
  const prompt = (f.prompt ?? "").trim();
  if (prompt.length < 3 || prompt.length > 1000) return { ok: false, error: "prompt" };
  const explanation = (f.explanation ?? "").trim().slice(0, 1000);
  if (f.kind === "true_false") {
    if (f.tf !== "true" && f.tf !== "false") return { ok: false, error: "correct" };
    return { ok: true, draft: { kind: "true_false", prompt, explanation, options: [labels.t, labels.f], correct: f.tf === "true" ? 0 : 1 } };
  }
  const options = (f.options ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 8 || options.some((o) => o.length > 300)) return { ok: false, error: "options" };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "duplicate" };
  const n = Number((f.correct ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (!Number.isInteger(n) || n < 1 || n > options.length) return { ok: false, error: "correct" };
  return { ok: true, draft: { kind: "mcq", prompt, explanation, options, correct: n - 1 } };
}

/** Collects `q_<questionId>` = `<optionId>` pairs from a submitted form; ignores anything malformed. */
export function collectAnswers(entries: Iterable<[string, unknown]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!k.startsWith("q_") || typeof v !== "string") continue;
    const qid = k.slice(2);
    if (UUID_RE.test(qid) && UUID_RE.test(v)) out[qid] = v;
  }
  return out;
}

export const CERT_NO_RE = /^WA-\d{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
export const normalizeCertNo = (s: string) => s.trim().toUpperCase();
export const isCertNo = (s: string) => CERT_NO_RE.test(normalizeCertNo(s));
export const verifyUrl = (site: string, no: string) => `${site.replace(/\/+$/, "")}/verify/${encodeURIComponent(normalizeCertNo(no))}`;
