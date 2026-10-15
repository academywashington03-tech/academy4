"use client";
export default function PrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="btn btn-gold">{label}</button>;
}
