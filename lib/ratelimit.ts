import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "./supabase/admin";
import { clientIp, rateKey } from "./ratelimit-core";

/**
 * Fixed-window rate limit stored in the database (works across serverless instances).
 * Counts by client IP and, optionally, by an identifier (hashed, so emails are never stored in clear).
 * Returns false when the caller is over the limit. FAILS OPEN if the limiter itself is unavailable,
 * so a database hiccup never locks real students out; Supabase's own auth limits still apply.
 */
export async function allow(action: string, limit: number, windowSec: number, identifier?: string): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const keys = [rateKey(action, clientIp(await headers()))];
    if (identifier) keys.push(rateKey(`${action}:id`, createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32)));
    const sb = createServiceClient();
    for (const key of keys) {
      const { data, error } = await sb.rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window: windowSec });
      if (error) return true;
      if (data === false) return false;
    }
    return true;
  } catch { return true; }
}
