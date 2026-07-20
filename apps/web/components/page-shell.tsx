import type { ReactNode } from "react";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`page-shell${className ? ` ${className}` : ""}`}>{children}</main>;
}

export function PageHeader({ label, title, action }: { label: string; title: string; action: ReactNode }) {
  return <header className="page-header">
    <div><p className="paper-label">{label}</p><h1>{title}</h1></div>
    <div className="page-header-action">{action}</div>
  </header>;
}
