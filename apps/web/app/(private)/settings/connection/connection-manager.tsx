"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Field, InlineNotice, Input, StatusSticker } from "../../../../components/ui";
import { apiFetch } from "../../../../lib/client";
import { SettingsNote } from "../settings-note";

type Person = { id: string; displayName: string; username: string | null; gender: "male" | "female"; roleLabel: string };
type Invitation = { id: string; status: string; createdAt: string; sender: Person | null; recipient: Person | null };
type Payload = {
  activeCouple: { id: string; startedAt: string; partner: Person } | null;
  latestEndedCouple: { id: string; startedAt: string; disconnectedAt: string | null; endedAt: string | null } | null;
  incoming: Invitation[];
  outgoing: Invitation[];
};

const confirmationPhrase = "연결을 정리할게요";

function invitationState(payload: Payload): string {
  if (payload.activeCouple) return "연결 완료";
  if (payload.incoming.some((item) => item.status === "pending")) return "받은 초대 확인 필요";
  if (payload.outgoing.some((item) => item.status === "pending")) return "보낸 초대 대기 중";
  return "기다리는 초대 없음";
}

export function ConnectionManager() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const [notificationState, setNotificationState] = useState("이 기기에서 확인이 필요해요");

  useEffect(() => {
    void apiFetch<Payload>("/api/couple").then(setPayload).catch(() => setMessage("연결 정보를 불러오지 못했어요"));
    if (typeof Notification !== "undefined") {
      setNotificationState(Notification.permission === "granted" ? "이 기기에서 알림을 받고 있어요" : Notification.permission === "denied" ? "이 기기에서 알림이 꺼져 있어요" : "이 기기에서 알림을 켤 수 있어요");
    }
  }, []);

  async function disconnect() {
    if (phrase !== confirmationPhrase || !password || busy) return;
    setBusy(true); setMessage("");
    try {
      await apiFetch("/api/couple/disconnect", { method: "POST", body: JSON.stringify({ password, phrase }) });
      setCompleted(true); setStep(0); setPassword(""); setPhrase("");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "연결을 정리하지 못했어요"); }
    finally { setBusy(false); }
  }

  if (completed) return <SettingsNote title="함께 쓰던 공간을 정리했어요" description="함께 남긴 추억과 약속은 그대로 보관돼요" tone="butter" className="connection-complete-note">
    <div className="connection-complete-actions"><Link className="paper-action-link" href="/home">추억 보기</Link><Link className="paper-action-link" href="/settings">설정으로</Link></div>
  </SettingsNote>;
  if (!payload) return message ? <InlineNotice tone="error">{message}</InlineNotice> : <p className="settings-loading">함께 쓰는 공간을 펼치고 있어요</p>;

  if (!payload.activeCouple) return <SettingsNote title={payload.latestEndedCouple ? "함께 쓰던 공간의 연결이 정리됐어요" : "연결된 공간이 없어요"} description={payload.latestEndedCouple ? "함께 남긴 기록은 그대로 보관돼요" : "설정에서 함께할 사람을 초대할 수 있어요"} tone="butter">
    <Link className="paper-action-link" href="/settings">설정으로</Link>
  </SettingsNote>;

  const { activeCouple } = payload;
  return <div className="connection-manager-stack">
    <SettingsNote title="지금 함께 쓰는 사람" description="연결된 사람과 공간 상태를 확인해요" tone="sky">
      <div className="connection-detail-person"><div><strong>{activeCouple.partner.displayName}</strong><span>{activeCouple.partner.username ? `@${activeCouple.partner.username}` : "아이디 준비 중"} · {activeCouple.partner.roleLabel}</span></div><StatusSticker tone="done">연결됨</StatusSticker></div>
      <dl className="connection-detail-list">
        <div><dt>함께 쓰기 시작한 날</dt><dd>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" }).format(new Date(activeCouple.startedAt))}</dd></div>
        <div><dt>초대 상태</dt><dd>{invitationState(payload)}</dd></div>
        <div><dt>공유 상태</dt><dd>새 약속과 추억을 함께 남길 수 있어요</dd></div>
        <div><dt>알림 상태</dt><dd>{notificationState}</dd></div>
      </dl>
    </SettingsNote>

    <SettingsNote title="함께 쓰는 공간 관리" description="연결과 보관 방법을 바꿀 수 있어요" tone="paper" className="connection-care-note">
      <details className="connection-management" open={step > 0}>
        <summary>관리 항목 펼치기</summary>
        <div className="connection-preservation-summary"><p><strong>현재 상태</strong><span>두 계정이 하나의 공간을 함께 쓰고 있어요</span></p><p><strong>보관 방법</strong><span>연결을 정리해도 기존 추억과 약속, 미디어는 남아요</span></p></div>
        {step === 0 && <button className="connection-cleanup-link" type="button" onClick={() => setStep(1)}>함께 쓰는 공간 정리</button>}
        {step === 1 && <div className="disconnect-step" role="dialog" aria-labelledby="disconnect-title">
          <h3 id="disconnect-title">정말 연결을 정리할까요</h3>
          <ul><li>함께 남긴 추억과 약속, 사진과 영상은 그대로 보관돼요</li><li>새로운 공동 약속과 미션은 더 만들 수 없어요</li><li>예약된 미션과 아직 끝나지 않은 공동 미션은 취소돼요</li><li>두 사람 모두 각자의 계정으로 계속 로그인할 수 있어요</li></ul>
          <div><Button variant="quiet" size="small" onClick={() => setStep(0)}>아직 그대로 둘게요</Button><Button variant="secondary" size="small" onClick={() => setStep(2)}>계속할게요</Button></div>
        </div>}
        {step === 2 && <div className="disconnect-step"><Field label="현재 비밀번호"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></Field><div><Button variant="quiet" size="small" onClick={() => setStep(1)}>이전으로</Button><Button variant="secondary" size="small" disabled={!password} onClick={() => setStep(3)}>계속할게요</Button></div></div>}
        {step === 3 && <div className="disconnect-step disconnect-final-step"><p>아래 문구를 그대로 입력해 주세요</p><strong>{confirmationPhrase}</strong><Field label="확인 문구"><Input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /></Field><div><Button variant="quiet" size="small" onClick={() => setStep(2)}>이전으로</Button><Button variant="danger" size="small" disabled={busy || phrase !== confirmationPhrase} onClick={() => void disconnect()}>{busy ? "정리하고 있어요" : "연결 정리하기"}</Button></div></div>}
      </details>
      {message && <InlineNotice tone="error">{message}</InlineNotice>}
    </SettingsNote>
  </div>;
}
