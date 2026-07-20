"use client";

import Link from "next/link";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Button, Field, InlineNotice, Input } from "../../../../components/ui";
import { apiFetch } from "../../../../lib/client";
import { SettingsNote } from "../settings-note";

type Account = {
  id: string;
  displayName: string;
  username: string;
  gender: "male" | "female";
  role: "user" | "admin";
  roleLabel: string;
  createdAt: string;
};

export function ProfileEditor() {
  const [account, setAccount] = useState<Account | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiFetch<{ user: Account }>("/api/account").then(({ user }) => {
      setAccount(user); setDisplayName(user.displayName); setGender(user.gender);
    }).catch(() => setMessage("계정 정보를 불러오지 못했어요"));
  }, []);

  async function save() {
    if (!account || busy) return;
    setBusy(true); setMessage("");
    try {
      const { user } = await apiFetch<{ user: Account }>("/api/account", { method: "PATCH", body: JSON.stringify({ displayName, gender }) });
      setAccount({ ...account, ...user });
      setDisplayName(user.displayName);
      setGender(user.gender);
      setMessage("계정 정보를 바꿨어요");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "계정 정보를 바꾸지 못했어요"); }
    finally { setBusy(false); }
  }

  function handleGenderKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    setGender((current) => current === "male" ? "female" : "male");
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[event.currentTarget === buttons[0] ? 1 : 0]?.focus();
  }

  if (!account) return message ? <InlineNotice tone="error">{message}</InlineNotice> : <p className="settings-loading">계정 정보를 펼치고 있어요</p>;
  return <SettingsNote title="기본 정보" description="이름과 성별을 바꿀 수 있어요" tone="leaf" className="profile-editor-note">
    <div className="profile-edit-form">
      <Field label="이름"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 20))} maxLength={20} /></Field>
      <fieldset className="gender-paper-picker">
        <legend>성별</legend>
        <div role="radiogroup" aria-label="성별">
          <button type="button" role="radio" aria-checked={gender === "male"} tabIndex={gender === "male" ? 0 : -1} className={gender === "male" ? "selected" : ""} onKeyDown={handleGenderKey} onClick={() => setGender("male")}><span aria-hidden="true">{gender === "male" ? "✓" : ""}</span>남성</button>
          <button type="button" role="radio" aria-checked={gender === "female"} tabIndex={gender === "female" ? 0 : -1} className={gender === "female" ? "selected" : ""} onKeyDown={handleGenderKey} onClick={() => setGender("female")}><span aria-hidden="true">{gender === "female" ? "✓" : ""}</span>여성</button>
        </div>
      </fieldset>
      <dl className="account-fixed-info">
        <div><dt>아이디</dt><dd>@{account.username}</dd></div>
        <div><dt>역할</dt><dd>{account.role === "admin" ? "관리자" : account.roleLabel}</dd></div>
        <div><dt>가입한 날</dt><dd>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(account.createdAt))}</dd></div>
      </dl>
      <div className="profile-edit-actions"><Button disabled={busy || !displayName.trim()} onClick={() => void save()}>{busy ? "저장하고 있어요" : "변경 내용 저장"}</Button><Link className="paper-action-link" href="/settings">설정으로</Link></div>
      {message && <InlineNotice tone={message.includes("못") || message.includes("입력") ? "error" : "success"}>{message}</InlineNotice>}
    </div>
  </SettingsNote>;
}
