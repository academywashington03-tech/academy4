import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestionForm, collectAnswers, isCertNo, normalizeCertNo, verifyUrl } from "../lib/quiz.ts";

const Q = "00000000-0000-0000-0000-0000000000a1", O = "00000000-0000-0000-0000-0000000000b1";
test("mcq question parsing", () => {
  const r = parseQuestionForm({ kind: "mcq", prompt: "ما عاصمة مصر؟", options: "القاهرة\n\n الإسكندرية \nأسوان", correct: "١" });
  assert.ok(r.ok); if (r.ok) { assert.deepEqual(r.draft.options, ["القاهرة", "الإسكندرية", "أسوان"]); assert.equal(r.draft.correct, 0); }
  for (const bad of [{ options: "a", correct: "1" }, { options: "a\nb", correct: "3" }, { options: "a\nb", correct: "0" }, { options: "a\nA", correct: "1" }, { options: "a\nb", correct: "x" }])
    assert.ok(!parseQuestionForm({ kind: "mcq", prompt: "valid prompt", ...bad }).ok);
  assert.ok(!parseQuestionForm({ kind: "mcq", prompt: "x", options: "a\nb", correct: "1" }).ok);
});
test("true/false parsing", () => {
  const t = parseQuestionForm({ kind: "true_false", prompt: "Water is wet", tf: "false" });
  assert.ok(t.ok); if (t.ok) { assert.deepEqual(t.draft.options, ["صح", "خطأ"]); assert.equal(t.draft.correct, 1); }
  assert.ok(!parseQuestionForm({ kind: "true_false", prompt: "Water is wet" }).ok);
});
test("answer collection ignores malformed input", () => {
  const a = collectAnswers([[`q_${Q}`, O], ["q_bad", O], [`q_${Q.replace("a1", "a2")}`, "not-a-uuid"], ["role", "admin"], [`q_${Q.replace("a1", "a3")}`, 5]]);
  assert.deepEqual(a, { [Q]: O });
});
test("certificate numbers", () => {
  assert.ok(isCertNo("WA-2026-AB12-CD34-EF56")); assert.ok(isCertNo(" wa-2026-ab12-cd34-ef56 "));
  for (const bad of ["", "WA-2026-AB12", "XX-2026-AB12-CD34-EF56", "WA-2026-ZZZZ-CD34-EF56", "WA-2026-AB12-CD34-EF56'; drop"]) assert.ok(!isCertNo(bad));
  assert.equal(normalizeCertNo(" wa-1 "), "WA-1");
  assert.equal(verifyUrl("https://x.com/", "wa-2026-ab12-cd34-ef56"), "https://x.com/verify/WA-2026-AB12-CD34-EF56");
});
