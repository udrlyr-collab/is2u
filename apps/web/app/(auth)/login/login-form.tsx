"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { Button, Field, InlineNotice, Input } from "../../../components/ui";
import { ApiError, apiFetch } from "../../../lib/client";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      const session = await apiFetch<{ authenticated: boolean }>("/api/auth/session");
      if (!session.authenticated) throw new Error("session_not_ready");
      window.location.assign("/home");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setError("아이디 또는 비밀번호가 맞지 않아요");
      else if (caught instanceof ApiError && caught.status === 429) setError("로그인 시도가 많아요 잠시 후 다시 시도해 주세요");
      else setError("잠시 후 다시 시도해 주세요");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <>
    <form onSubmit={submit} className="account-form">
      <Field label="아이디"><Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} autoComplete="username" minLength={4} maxLength={20} required autoFocus /></Field>
      <Field label="비밀번호"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} maxLength={128} required /></Field>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <Button disabled={busy} aria-busy={busy}>{busy ? "로그인 정보를 확인하고 있어요" : "들어가기"}</Button>
    </form>
    <nav className="auth-links" aria-label="계정 도움말"><Link href="/signup">처음 오셨나요</Link></nav>
  </>;
}
