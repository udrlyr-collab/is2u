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
type TestTemplate = {
  id: string;
  category: "video" | "photo" | "text";
  title: string;
  prompt: string;
  enabled: boolean;
};

const statusText: Record<string, string> = { scheduled: "대기 중", sent: "열 수 있음", completed: "완료", skipped: "지나감", expired: "만료", cancelled: "취소" };
const categories = [
  { id: "random", label: "무작위", mark: "✦" },
  { id: "video", label: "영상", mark: "▷" },
  { id: "photo", label: "사진", mark: "▧" },
  { id: "text", label: "한 줄 기록", mark: "—" },
] as const;
type Category = typeof categories[number]["id"];

export function MissionTestPanel() {
  const [missions, setMissions] = useState<TestMission[]>([]);
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [recipient, setRecipient] = useState("random");
  const [category, setCategory] = useState<Category>("random");
  const [templateId, setTemplateId] = useState("random");
  const [delay, setDelay] = useState("now");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ missions: TestMission[]; templates: TestTemplate[] }>("/api/mission-test");
      setMissions(result.missions);
      setTemplates(result.templates);
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
    <p className="muted">실제 미션과 같은 저장·업로드·처리 흐름을 사용하며 만든 즉시 추억 타임라인에도 표시돼요.</p>
    <div className="mission-test-controls">
      <Field label="받는 사람"><Select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="random">무작위</option><option value="seongmin">홍성민</option><option value="seoyeong">이서영</option></Select></Field>
      <Field label="보내는 때"><Select value={delay} onChange={(event) => setDelay(event.target.value)}><option value="now">즉시</option><option value="one-minute">1분 뒤</option></Select></Field>
    </div>
    <fieldset className="test-template-fieldset"><legend>미션 종류</legend><div className="test-category-tabs" role="radiogroup" aria-label="테스트 미션 종류">{categories.map((item) => <button key={item.id} type="button" role="radio" aria-checked={category === item.id} className={category === item.id ? "selected" : ""} data-paper-sound="note-stick" onClick={() => { setCategory(item.id); setTemplateId("random"); }}><span aria-hidden="true">{item.mark}</span>{item.label}<i aria-hidden="true">✓</i></button>)}</div></fieldset>
    <fieldset className="test-template-fieldset"><legend>세부 미션</legend><div className="test-template-notes" role="radiogroup" aria-label="세부 테스트 미션"><button type="button" role="radio" aria-checked={templateId === "random"} className={templateId === "random" ? "selected" : ""} data-paper-sound="note-stick" onClick={() => setTemplateId("random")}><strong><span aria-hidden="true">✦</span> 무작위</strong><small>{category === "random" ? "세 종류와 세부 미션을 모두 무작위로 골라요." : "선택한 종류 안에서 하나를 골라요."}</small><i aria-hidden="true">✓</i></button>{category !== "random" && templates.filter((template) => template.category === category && template.enabled).map((template) => <button type="button" role="radio" aria-checked={templateId === template.id} className={templateId === template.id ? "selected" : ""} key={template.id} data-paper-sound="note-stick" onClick={() => setTemplateId(template.id)}><strong>{template.title}</strong><small>{template.prompt}</small><i aria-hidden="true">✓</i></button>)}</div></fieldset>
    <div className="form-actions"><Button disabled={busy} data-paper-sound="save-soft" onClick={() => void action({ action: "create", recipient, category, templateId, delay }, "테스트 미션을 만들었어요.")}>테스트 미션 생성</Button></div>
    {message && <InlineNotice>{message}</InlineNotice>}

    <div className="test-mission-list">
      {missions.length === 0 && <p className="muted">현재 테스트 미션이 없어요.</p>}
      {missions.map((mission) => {
        const original = mission.memory?.assets.find((asset) => asset.role === "original");
        const preview = mission.memory?.assets.find((asset) => asset.role === "preview");
        return <article className="test-mission-item" key={mission.id}>
          <header><strong>{mission.copy.title}</strong><span className="status-label">{statusText[mission.status] ?? mission.status}</span></header>
          <p className="test-mission-prompt">{mission.copy.prompt}</p>
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
    {missions.length > 0 && <div className="test-footer-actions"><Link className="button button-sticker button-regular" data-paper-sound="page-open" href="/home">추억에서 미션 보기</Link><Button variant="danger" disabled={busy} data-paper-sound="note-peel" onClick={() => setConfirmReset(true)}>테스트 데이터 전체 삭제</Button></div>}
    {confirmReset && <PaperConfirmDialog title="모든 테스트 데이터를 삭제할까요?" description="테스트 미션과 연결된 테스트 파일만 영구 삭제해요. 실제 미션과 기억은 건드리지 않아요." confirmLabel="테스트 데이터 삭제" busy={busy} onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); void action({ action: "reset" }, "테스트 데이터를 모두 삭제했어요."); }} />}
  </section>;
}
