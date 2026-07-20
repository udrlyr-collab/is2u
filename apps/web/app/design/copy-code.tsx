"use client";

import { useEffect, useRef, useState } from "react";

export function KitActions({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function announce(text: string) {
    setMessage(text);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 2200);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      announce("스타터 CSS를 복사했어요");
    } catch {
      announce("복사하지 못했어요 코드 영역에서 직접 복사해 주세요");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([code], { type: "text/css;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "is2u-design-kit.css";
    anchor.click();
    URL.revokeObjectURL(url);
    announce("is2u-design-kit.css를 만들었어요");
  }

  return <div className="design-kit-actions">
    <button type="button" className="design-action design-action-primary" onClick={() => void copy()}>전체 CSS 복사</button>
    <button type="button" className="design-action" onClick={download}>CSS 파일로 저장</button>
    <span className="design-copy-status" role="status">{message}</span>
  </div>;
}

export function CopyCode({ title, code, note }: { title: string; code: string; note?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <section className="design-code-panel">
    <header><div><h3>{title}</h3>{note && <p>{note}</p>}</div><button type="button" onClick={() => void copy()}>{copied ? "복사했어요" : "복사"}</button></header>
    <pre tabIndex={0}><code>{code}</code></pre>
  </section>;
}
