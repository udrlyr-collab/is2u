import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger" | "sticker";
  size?: "regular" | "small";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "regular", className = "", ...props }, ref) {
  return <button ref={ref} className={`button button-${variant} button-${size} ${className}`.trim()} {...props} />;
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function IconButton({ className = "", ...props }, ref) {
  return <button ref={ref} className={`icon-button ${className}`.trim()} {...props} />;
});

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className ?? ""}`.trim()} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${props.className ?? ""}`.trim()} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input select ${props.className ?? ""}`.trim()} {...props} />;
}

export function PaperCard({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`paper-card ${className}`.trim()} {...props} />;
}

export function DateLabel({ date, className = "" }: { date: Date; className?: string }) {
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "short" }).format(date).toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", day: "2-digit" }).format(date);
  return <span className={`date-label ${className}`.trim()}><small>{month}</small><strong>{day}</strong></span>;
}

export function MemoryPhoto({ children, caption }: { children: ReactNode; caption?: string }) {
  return <figure className="memory-photo"><div className="memory-photo-frame">{children}</div>{caption && <figcaption>{caption}</figcaption>}</figure>;
}

export function MissionNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mission-note ${className}`.trim()}><span className="paper-tape" aria-hidden="true" />{children}</section>;
}

export function InlineNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "success" }) {
  return <p className={`inline-notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

export function StatusSticker({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "active" | "done" | "expired" | "test" | "cancelled" }) {
  return <span className={`status-sticker sticker-${tone}`}>{children}</span>;
}
