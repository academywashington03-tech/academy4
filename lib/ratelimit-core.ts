// Pure helpers for rate limiting (unit-tested).
export function clientIp(h: { get(name: string): string | null }): string {
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "unknown";
}
export const rateKey = (action: string, id: string) => `${action.replace(/[^a-z0-9_:-]/gi, "")}:${id}`.slice(0, 200);
