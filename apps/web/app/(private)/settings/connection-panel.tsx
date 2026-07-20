"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, InlineNotice, Input, StatusSticker } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { SettingsNote } from "./settings-note";

type Person = { id: string; displayName: string; username: string | null; gender: "male" | "female"; roleLabel: string };
type Invitation = { id: string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; expiresAt: string; createdAt: string; sender: Person | null; recipient: Person | null };
type CouplePayload = {
  user: Person;
  activeCouple: { id: string; startedAt: string; partner: Person } | null;
  latestEndedCouple: { id: string; startedAt: string; disconnectedAt: string | null; endedAt: string | null } | null;
  incoming: Invitation[];
  outgoing: Invitation[];
};

export function ConnectionPanel({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const [payload, setPayload] = useState<CouplePayload | null>(null);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState<Invitation | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<CouplePayload>("/api/couple");
      setPayload(next);
      onConnectionChange?.(Boolean(next.activeCouple));
    } catch { setMessage("연결 상태를 불러오지 못했어요"); }
  }, [onConnectionChange]);
  useEffect(() => { void load(); }, [load]);

  async function invite() {
    if (!username || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await apiFetch<{ message: string }>("/api/couple/invitations", { method: "POST", body: JSON.stringify({ username }) });
      setMessage(result.message); setUsername(""); await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "초대를 보내지 못했어요"); }
    finally { setBusy(false); }
  }

  async function invitationAction(invitationId: string, action: "accept" | "decline" | "cancel") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      await apiFetch(`/api/couple/invitations/${invitationId}`, { method: "POST", body: JSON.stringify({ action }) });
      setConfirmInvite(null);
      setMessage(action === "accept" ? "서로의 추억 상자가 연결됐어요" : action === "decline" ? "초대를 정리했어요" : "보낸 초대를 취소했어요");
      await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "초대를 처리하지 못했어요"); }
    finally { setBusy(false); }
  }

  const pendingIncoming = payload?.incoming.filter((item) => item.status === "pending") ?? [];
  const pendingOutgoing = payload?.outgoing.filter((item) => item.status === "pending") ?? [];
  return <SettingsNote title="함께 쓰는 공간" description={payload?.activeCouple ? "지금 연결된 사람을 확인해요" : "함께할 사람을 초대해 보세요"} tone="sky" className="connection-summary-note">
    {!payload && !message && <p className="settings-loading">연결 상태를 펼치고 있어요</p>}
    {payload?.activeCouple ? <div className="partner-paper">
      <span className={`partner-color partner-${payload.activeCouple.partner.gender}`} aria-hidden="true" />
      <div>
        <StatusSticker tone="done">연결됨</StatusSticker>
        <h3>{payload.activeCouple.partner.displayName}</h3>
        <p>{payload.activeCouple.partner.username ? `@${payload.activeCouple.partner.username}` : "아이디 준비 중"} · {payload.activeCouple.partner.roleLabel}</p>
        <small>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(payload.activeCouple.startedAt))}부터 함께 쓰고 있어요</small>
      </div>
      <Link className="paper-action-link" href="/settings/connection">연결 관리</Link>
    </div> : payload && <div className="connection-empty">
      <div className="invite-row"><Field label="아이디"><Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="상대의 아이디" minLength={4} maxLength={20} /></Field><Button size="small" disabled={busy || username.length < 4} onClick={() => void invite()}>초대 보내기</Button></div>
      <Link className="paper-action-link" href="/settings/connection">연결 관리</Link>
    </div>}

    {pendingIncoming.length > 0 && <div className="invitation-stack"><h3>도착한 초대</h3>{pendingIncoming.map((invitation) => <article className="invitation-note" key={invitation.id}><div><strong>{invitation.sender?.displayName ?? "알 수 없는 사용자"}</strong><span>@{invitation.sender?.username}</span><p>함께 추억 상자를 쓰자는 초대가 도착했어요</p></div><div><Button size="small" onClick={() => setConfirmInvite(invitation)}>초대 수락</Button><Button size="small" variant="quiet" disabled={busy} onClick={() => void invitationAction(invitation.id, "decline")}>거절하기</Button></div></article>)}</div>}
    {pendingOutgoing.length > 0 && <div className="outgoing-invites"><h3>기다리는 초대</h3>{pendingOutgoing.map((invitation) => <p key={invitation.id}><span>{invitation.recipient?.displayName} @{invitation.recipient?.username}</span><button type="button" disabled={busy} onClick={() => void invitationAction(invitation.id, "cancel")}>초대 취소</button></p>)}</div>}
    {confirmInvite && <div className="connection-confirm" role="dialog" aria-modal="true" aria-labelledby="invite-confirm-title"><span className="paper-tape" aria-hidden="true" /><h3 id="invite-confirm-title">{confirmInvite.sender?.displayName}님과 연결할까요</h3><p>수락하면 두 사람의 공간이 생기고 함께 약속과 미션을 쓸 수 있어요</p><div><Button disabled={busy} onClick={() => void invitationAction(confirmInvite.id, "accept")}>연결하기</Button><Button variant="quiet" onClick={() => setConfirmInvite(null)}>조금 더 생각할게요</Button></div></div>}
    {message && <InlineNotice tone={message.includes("못") || message.includes("확인") ? "error" : "success"}>{message}</InlineNotice>}
  </SettingsNote>;
}
