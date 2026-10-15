import { createSign } from "node:crypto";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/**
 * Signs a Cloudflare Stream playback token (RS256 JWT) locally with a signing key.
 * The key's `pem` from the Cloudflare API is base64-encoded; a raw PEM is also accepted.
 * The video must have "requireSignedURLs" enabled in Cloudflare, otherwise the token adds no protection.
 */
export function signStreamToken(o: { uid: string; keyId: string; pem: string; ttlSeconds?: number; now?: number }): string {
  const pem = o.pem.trim().startsWith("-----") ? o.pem : Buffer.from(o.pem, "base64").toString("utf8");
  const nowS = Math.floor((o.now ?? Date.now()) / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: o.keyId }));
  const payload = b64url(JSON.stringify({ sub: o.uid, kid: o.keyId, exp: nowS + (o.ttlSeconds ?? 7200), nbf: nowS - 30 }));
  const sig = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(pem);
  return `${header}.${payload}.${b64url(sig)}`;
}

export function streamPlayerUrl(customerCode: string, token: string) {
  return `https://customer-${encodeURIComponent(customerCode)}.cloudflarestream.com/${token}/iframe`;
}
