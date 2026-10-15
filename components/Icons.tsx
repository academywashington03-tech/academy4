const P: Record<string, string> = {
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0M19 8v6m3-3h-6",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  play: "M4 5h16v11H4zM9 9l5 2.5L9 14zM8 20h8",
  file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  cert: "M5 4h14v11H5zM8 8h8M8 11h5M10 21l2-4 2 4v-6h-4z",
  menu: "M4 7h16M4 12h16M4 17h16",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13",
};
export function Icon({ name, className = "h-6 w-6" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
