"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches server data every few seconds while a payment is still being confirmed (max ~2 minutes). */
export default function AutoRefresh({ everyMs = 4000, maxTimes = 30 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { if (++n > maxTimes) clearInterval(t); else router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, maxTimes]);
  return null;
}
