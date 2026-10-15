import test from "node:test";
import assert from "node:assert/strict";
import { safeEqual } from "../lib/secure-compare.ts";

test("safeEqual: equal strings match", () => assert.equal(safeEqual("Bearer abc", "Bearer abc"), true));
test("safeEqual: different strings, different lengths and missing values never match", () => {
  assert.equal(safeEqual("Bearer abc", "Bearer abd"), false);
  assert.equal(safeEqual("a", "aa"), false);
  assert.equal(safeEqual(null, "x"), false);
  assert.equal(safeEqual("x", undefined), false);
  assert.equal(safeEqual("", ""), true);
});
