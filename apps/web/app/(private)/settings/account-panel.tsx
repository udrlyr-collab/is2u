"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InlineNotice } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { SettingsNote } from "./settings-note";

type Account = {
  id: string;
  displayName: string;
  username: string;
  gender: "male" | "female";
  role: "user" | "admin";
  roleLabel: string;
  createdAt: string;
};

export function AccountPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void apiFetch<{ user: Account }>("/api/account").then(({ user }) => setAccount(user)).catch(() => setMessage("계정 정보를 불러오지 못했어요"));
  }, []);

  if (!account) return message ? <InlineNotice tone="error">{message}</InlineNotice> : <p className="settings-loading">계정 정보를 펼치고 있어요</p>;
  return <SettingsNote title="내 계정" description="내 이름과 기본 정보를 확인해요" tone="leaf" className="account-summary-note">
    <div className="account-summary">
      <div>
        <strong>{account.displayName}</strong>
        <span>@{account.username}</span>
      </div>
      <div className="account-summary-labels">
        <span>{account.gender === "male" ? "남성" : "여성"}</span>
        <span>{account.role === "admin" ? "관리자" : account.roleLabel}</span>
      </div>
      <Link className="paper-action-link" href="/settings/profile">정보 수정</Link>
    </div>
  </SettingsNote>;
}
