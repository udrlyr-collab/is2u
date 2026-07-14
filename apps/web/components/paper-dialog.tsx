"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Button } from "./ui";

export function PaperConfirmDialog({ title, description, confirmLabel, cancelLabel = "그대로 두기", busy = false, onCancel, onConfirm }: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelRef.current) {
      event.preventDefault(); confirmRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
      event.preventDefault(); cancelRef.current?.focus();
    }
  }

  return <div className="paper-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="paper-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <span className="dialog-tape" aria-hidden="true" />
      <p className="paper-label">PLEASE CHECK</p>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      <div className="dialog-actions"><Button ref={cancelRef} variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button><Button ref={confirmRef} variant="danger" disabled={busy} onClick={onConfirm}>{busy ? "처리하는 중…" : confirmLabel}</Button></div>
    </div>
  </div>;
}
