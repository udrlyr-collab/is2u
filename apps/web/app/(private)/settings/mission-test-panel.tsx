"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, InlineNotice, Select } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";

type TestMission = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  recipientName: string;
  canOpen: boolean;
  copy: { title: string; prompt: string };
  memory: { id: string; type: string; assets: Array<{ id: string; role: string; processingStatus: string }> } | null;
};

const statusText: Record<string, string> = { scheduled: "대기 중", sent: "열 수 있음", completed: "완료", skipped: "지나감", expired: "만료", cancelled: "취소" };
const typeText: Record<string, string> = { audio: "10초 음성", photo: "사진", video: "짧은 영상", text: "한 줄 기록", emotion: "감정 선택" };

export function MissionTestPanel() {
  const [missions, setMissions] = useState<TestMission[]>([]);
  const [recipient, setRecipient] = useState("seongmin");
  const [missionType, setMissionType] = useState("photo");
  const [delay, setDelay] = useState("now");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ missions: TestMission[] }>("/api/mission-test");
      setMissions(result.missions);
    } catch {
      setMessage("테스트 미션 상태를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function action(body: object, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch("/api/mission-test", { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      await refresh();
    } catch {
      setMessage("테스트 작업을 완료하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return <section id="mission-test" className="mission-test-panel" aria-label="개발자 미션 테스트">
    <p className="paper-label">DEVELOPER NOTE</p>
    <h2>미션 테스트</h2>
    <p className="muted">실제 미션과 같은 저장·업로드·처리 흐름을 사용합니다. 일반 기억에는 나타나지 않아요.</p>
    <div className="mission-test-controls">
      <Field label="받는 사람"><Select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="seongmin">홍성민</option><option value="seoyeong">이서영</option><option value="random">무작위</option></Select></Field>
      <Field label="미션 종류"><Select value={missionType} onChange={(event) => setMissionType(event.target.value)}><option value="audio">10초 음성</option><option value="photo">사진</option><option value="video">짧은 영상</option><option value="text">한 줄 기록</option><option value="emotion">감정 선택</option><option value="random">무작위</option></Select></Field>
      <Field label="보내는 때"><Select value={delay} onChange={(event) => setDelay(event.target.value)}><option value="now">즉시</option><option value="one-minute">1분 뒤</option></Select></Field>
    </div>
    <div className="form-actions"><Button disabled={busy} onClick={() => void action({ action: "create", recipient, missionType, delay }, "테스트 미션을 만들었어요.")}>테스트 미션 생성</Button></div>
    {message && <InlineNotice>{message}</InlineNotice>}

    <div className="test-mission-list">
      {missions.length === 0 && <p className="muted">현재 테스트 미션이 없어요.</p>}
      {missions.map((mission) => {
        const original = mission.memory?.assets.find((asset) => asset.role === "original");
        const preview = mission.memory?.assets.find((asset) => asset.role === "preview");
        return <article className="test-mission-item" key={mission.id}>
          <header><strong>{typeText[mission.type] ?? mission.copy.title}</strong><span className="status-label">{statusText[mission.status] ?? mission.status}</span></header>
          <p>수신자 {mission.recipientName} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(mission.scheduledAt))}</p>
          {mission.memory && <p>기억 {mission.memory.type} · 원본 {original?.processingStatus ?? "없음"} · 미리보기 {preview?.processingStatus ?? "준비 중"}</p>}
          <div className="test-actions">
            {mission.canOpen && mission.status === "sent" && <Link className="button button-secondary" href={`/missions/${mission.id}`}>미션 열기</Link>}
            {mission.canOpen && mission.status === "completed" && <Link className="button button-secondary" href={`/missions/${mission.id}`}>완료 기록 보기</Link>}
            {!mission.canOpen && mission.status === "sent" && <span className="muted">수신자 계정에서 열 수 있어요.</span>}
            {!['expired', 'completed'].includes(mission.status) && <Button variant="quiet" disabled={busy} onClick={() => void action({ action: "expire", missionId: mission.id }, "미션을 만료했어요.")}>만료 처리</Button>}
            <Button variant="danger" disabled={busy} onClick={() => void action({ action: "delete", missionId: mission.id }, "테스트 미션과 파일을 삭제했어요.")}>삭제</Button>
          </div>
        </article>;
      })}
    </div>
    {missions.length > 0 && <div className="test-footer-actions"><Link className="button button-sticker button-regular" href="/home">순간에서 미션 보기</Link><Button variant="danger" disabled={busy} onClick={() => setConfirmReset(true)}>테스트 데이터 전체 삭제</Button></div>}
    {confirmReset && <PaperConfirmDialog title="모든 테스트 데이터를 삭제할까요?" description="테스트 미션과 연결된 테스트 파일만 영구 삭제해요. 실제 미션과 기억은 건드리지 않아요." confirmLabel="테스트 데이터 삭제" busy={busy} onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); void action({ action: "reset" }, "테스트 데이터를 모두 삭제했어요."); }} />}
  </section>;
}
