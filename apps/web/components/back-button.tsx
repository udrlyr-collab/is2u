"use client";

import { useRouter } from "next/navigation";

export function BackButton({ fallback = "/home", label = "뒤로" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return <button type="button" className="back-button" onClick={() => {
    const sameOriginReferrer = document.referrer ? new URL(document.referrer).origin === window.location.origin : false;
    if (window.history.length > 1 && sameOriginReferrer) router.back();
    else router.push(fallback);
  }} aria-label={`${label} 가기`}>
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 6.5-5.5 5.5 5.5 5.5M9.5 12H20" /></svg>
    <span>{label}</span>
  </button>;
}
