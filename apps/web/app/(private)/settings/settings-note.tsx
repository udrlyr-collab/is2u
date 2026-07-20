import type { ReactNode } from "react";

export function SettingsNote({
  title,
  description,
  tone = "paper",
  children,
  className = "",
}: {
  title: string;
  description?: string;
  tone?: "paper" | "leaf" | "sky" | "butter" | "rose" | "danger";
  children?: ReactNode;
  className?: string;
}) {
  return <section className={`settings-note-card settings-note-${tone} ${className}`.trim()}>
    <div className="settings-note-copy">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {children}
  </section>;
}
