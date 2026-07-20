"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { userFacingSentence } from "@is2u/core/types";
import { Button, Field, InlineNotice, Input, Select } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";

type TestMission = { id: string; type: string; status: string; scheduledAt: string; recipientName: string; canOpen: boolean; deliveryStatus: string; failureCode: string | null; copy: { title: string; prompt: string }; memory: { id: string; type: string; assets: Array<{ id: string; role: string; processingStatus: string }> } | null };
type TestTemplate = { id: string; category: "video" | "photo" | "text" | "audio" | "emotion"; title: string; prompt: string; enabled: boolean };
const statusText: Record<string, string> = { scheduled: "대기 중", sent: "열 수 있음", completed: "완료", skipped: "지나감", expired: "만료", cancelled: "취소" };
const categories = [
  { id: "random", label: "무작위", mark: "✦" }, { id: "video", label: "영상", mark: "▷" }, { id: "photo", label: "사진", mark: "▧" },
  { id: "text", label: "한 줄 기록", mark: "—" }, { id: "audio", label: "음성", mark: "⌁" }, { id: "emotion", label: "감정·선택", mark: "♡" },
] as const;
type Category = (typeof categories)[number]["id"];

export function AdminTestPanel() {
  const [missions, setMissions] = useState<TestMission[]>([]);
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [recipientMode, setRecipientMode] = useState("random");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [category, setCategory] = useState<Category>("random");
  const [templateId, setTemplateId] = useState("random");
  const [delay, setDelay] = useState("now");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ missions: TestMission[]; templates: TestTemplate[] }>("/api/admin/tests");
      setMissions(result.missions); setTemplates(result.templates);
    } catch { setMessage("테스트 미션 상태를 불러오지 못했어요"); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(timer); }, [refresh]);
  async function action(body: object, success: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await apiFetch("/api/admin/tests", { method: "POST", body: JSON.stringify(body) }); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "요청한 작업을 완료하지 못했어요"); }
    finally { setBusy(false); }
  }
  return <section className="mission-test-panel admin-test-panel" aria-label="관리자 테스트 미션 도구">
    <p className="paper-label">MISSION TEST FILE</p><h2>테스트 미션 보내기</h2><p className="muted">활성 미션 14종을 실제 미션과 같은 저장·업로드·처리 흐름으로 확인해요</p>
    <div className="mission-test-controls">
      <Field label="받는 사람"><Select value={recipientMode} onChange={(event) => setRecipientMode(event.target.value)}><option value="random">활성 계정 중 무작위</option><option value="self">관리자 본인</option><option value="user">아이디로 지정</option><option value="couple-random">활성 연결 중 무작위</option></Select></Field>
      {recipientMode === "user" && <Field label="받는 사람 아이디"><Input value={recipientUsername} maxLength={20} autoCapitalize="none" onChange={(event) => setRecipientUsername(event.target.value.toLowerCase())} placeholder="아이디" /></Field>}
      <Field label="보내는 때"><Select value={delay} onChange={(event) => setDelay(event.target.value)}><option value="now">즉시</option><option value="one-minute">1분 뒤</option></Select></Field>
    </div>
    <fieldset className="test-template-fieldset"><legend>미션 종류</legend><div className="test-category-tabs" role="radiogroup" aria-label="미션 종류">{categories.map((item) => <button key={item.id} type="button" role="radio" aria-checked={category === item.id} className={category === item.id ? "selected" : ""} onClick={() => { setCategory(item.id); setTemplateId("random"); }}><span aria-hidden="true">{item.mark}</span>{item.label}<i aria-hidden="true">✓</i></button>)}</div></fieldset>
    <fieldset className="test-template-fieldset"><legend>세부 미션</legend><div className="test-template-notes" role="radiogroup" aria-label="세부 미션"><button type="button" role="radio" aria-checked={templateId === "random"} className={templateId === "random" ? "selected" : ""} onClick={() => setTemplateId("random")}><strong><span aria-hidden="true">✦</span> 무작위</strong><small>{category === "random" ? "전체 활성 미션에서 하나를 골라요" : "선택한 종류 안에서 하나를 골라요"}</small><i aria-hidden="true">✓</i></button>{category !== "random" && templates.filter((template) => template.category === category && template.enabled).map((template) => <button type="button" role="radio" aria-checked={templateId === template.id} className={templateId === template.id ? "selected" : ""} key={template.id} onClick={() => setTemplateId(template.id)}><strong>{template.title}</strong><small>{userFacingSentence(template.prompt)}</small><i aria-hidden="true">✓</i></button>)}</div></fieldset>
    <div className="form-actions"><Button disabled={busy} onClick={() => void action({ action: "create", recipientMode, recipientUsername: recipientMode === "user" ? recipientUsername : undefined, category, templateId, delay }, "테스트 미션을 만들었어요")}>테스트 미션 만들기</Button></div>
    {message && <InlineNotice>{message}</InlineNotice>}
    <div className="test-mission-list">{missions.length === 0 && <p className="muted">관리자 도구에서 만든 미션이 없어요</p>}{missions.map((mission) => {
      const original = mission.memory?.assets.find((asset) => asset.role === "original"); const preview = mission.memory?.assets.find((asset) => asset.role === "preview");
      return <article className="test-mission-item" key={mission.id}><header><strong>{mission.copy.title}</strong><span className="status-label">{statusText[mission.status] ?? mission.status}</span></header><p className="test-mission-prompt">{userFacingSentence(mission.copy.prompt)}</p><p>수신자 {mission.recipientName} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(mission.scheduledAt))}</p><p>전달 기록 {mission.deliveryStatus}{mission.failureCode ? " · 전달 확인 필요" : ""}</p>{mission.memory && <p>기록 {mission.memory.type} · 원본 {original?.processingStatus ?? "없음"} · 미리보기 {preview?.processingStatus ?? "준비 중"}</p>}<div className="test-actions">{mission.canOpen && ["sent", "completed"].includes(mission.status) && <Link className="button button-secondary" href={`/missions/${mission.id}`}>{mission.status === "completed" ? "완료 기록 보기" : "미션 열기"}</Link>}{!mission.canOpen && mission.status === "sent" && <span className="muted">수신자 계정에서 열 수 있어요</span>}{!["expired", "completed"].includes(mission.status) && <Button variant="quiet" disabled={busy} onClick={() => void action({ action: "expire", missionId: mission.id }, "테스트 미션을 만료했어요")}>만료 처리</Button>}<Button variant="danger" disabled={busy} onClick={() => void action({ action: "delete", missionId: mission.id }, "테스트 미션과 파일을 지웠어요")}>삭제</Button></div></article>;
    })}</div>
    {missions.length > 0 && <div className="test-footer-actions"><Button variant="danger" disabled={busy} onClick={() => setConfirmReset(true)}>테스트 데이터 모두 지우기</Button></div>}
    {confirmReset && <PaperConfirmDialog title="테스트 데이터를 모두 지울까요" description="관리자 도구에서 만든 모든 테스트 미션과 연결된 파일을 영구 삭제해요" confirmLabel="모두 지우기" busy={busy} onCancel={() => setConfirmReset(false)} onConfirm={() => { setConfirmReset(false); void action({ action: "reset" }, "테스트 데이터를 모두 지웠어요"); }} />}
  </section>;
}
