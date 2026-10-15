import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { signStreamToken, streamPlayerUrl } from "../lib/stream.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

for (const [label, input] of [["raw PEM", pem], ["base64 PEM", Buffer.from(pem).toString("base64")]] as const) {
  test(`stream token verifies (${label})`, () => {
    const now = 1_700_000_000_000;
    const t = signStreamToken({ uid: "a".repeat(32), keyId: "key1", pem: input, ttlSeconds: 600, now });
    const [h, p, s] = t.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    assert.ok(ok);
    assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", kid: "key1" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.equal(claims.sub, "a".repeat(32)); assert.equal(claims.kid, "key1"); assert.equal(claims.exp, 1_700_000_600);
  });
}
test("tampered token fails verification", () => {
  const t = signStreamToken({ uid: "b".repeat(32), keyId: "k", pem });
  const [h, , s] = t.split(".");
  const evil = Buffer.from(JSON.stringify({ sub: "c".repeat(32), kid: "k", exp: 9999999999 })).toString("base64url");
  assert.ok(!createVerify("RSA-SHA256").update(`${h}.${evil}`).verify(publicKey, Buffer.from(s, "base64url")));
});
test("player URL shape", () => {
  assert.equal(streamPlayerUrl("abc123", "T.O.K"), "https://customer-abc123.cloudflarestream.com/T.O.K/iframe");
});
