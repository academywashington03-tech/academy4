"use client";
import { useRef, type ReactNode } from "react";

/**
 * Mobile menu. It is a native <details> (so it still opens without JavaScript) that also closes itself when a link inside it is tapped.
 * The navbar lives in the root layout and is NOT re-mounted on client-side navigation, so without this the open menu would stay on
 * top of the page the visitor just navigated to (including same-page "#anchor" links, where the path does not change).
 */
export default function NavMenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative md:hidden" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) ref.current?.removeAttribute("open"); }}>
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-gold-500/40 text-gold-300" aria-label={label}>
        {icon}
      </summary>
      {children}
    </details>
  );
}
