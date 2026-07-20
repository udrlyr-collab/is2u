"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button, Field, InlineNotice, Input } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";

export function SignupForm() {
  const [form, setForm] = useState({ displayName: "", username: "", password: "", passwordConfirm: "", gender: "male" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/signup", { method: "POST", body: JSON.stringify(form) });
      window.location.assign("/home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "가입하지 못했어요");
    } finally { setBusy(false); }
  }

  return <>
    <form onSubmit={submit} className="account-form">
      <Field label="이름"><Input value={form.displayName} onChange={(event) => set("displayName", event.target.value.slice(0, 20))} autoComplete="name" maxLength={20} required /></Field>
      <Field label="아이디" hint="영문 소문자, 숫자, 밑줄로 4~20자"><Input value={form.username} onChange={(event) => set("username", event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} autoComplete="username" minLength={4} maxLength={20} required /></Field>
      <fieldset className="paper-choice-field"><legend>성별</legend><label className={form.gender === "male" ? "selected" : ""}><input type="radio" name="gender" value="male" checked={form.gender === "male"} onChange={() => set("gender", "male")} /><span>남성</span></label><label className={form.gender === "female" ? "selected" : ""}><input type="radio" name="gender" value="female" checked={form.gender === "female"} onChange={() => set("gender", "female")} /><span>여성</span></label></fieldset>
      <Field label="비밀번호" hint="8자 이상이며 너무 단순한 비밀번호는 사용할 수 없어요"><Input type="password" value={form.password} onChange={(event) => set("password", event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></Field>
      <Field label="비밀번호 확인"><Input type="password" value={form.passwordConfirm} onChange={(event) => set("passwordConfirm", event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></Field>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <Button disabled={busy}>{busy ? "상자를 만드는 중이에요" : "가입하기"}</Button>
    </form>
    <nav className="auth-links"><Link href="/login">이미 계정이 있어요</Link></nav>
  </>;
}
