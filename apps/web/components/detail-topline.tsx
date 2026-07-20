import Link from "next/link";
import type { ReactNode } from "react";

function BackArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 6.5-5.5 5.5 5.5 5.5M9.5 12H20" /></svg>;
}

export function DetailBackLink({ href, label, ariaLabel }: { href: string; label: string; ariaLabel?: string }) {
  return <Link className="back-button" href={href} aria-label={ariaLabel ?? label}><BackArrow /><span>{label}</span></Link>;
}

export function DetailTopline({ back, label }: { back: ReactNode; label: string }) {
  return <div className="detail-topline">
    {back}
    <span className="detail-topline-separator" aria-hidden="true">·</span>
    <span className="paper-label">{label}</span>
  </div>;
}
