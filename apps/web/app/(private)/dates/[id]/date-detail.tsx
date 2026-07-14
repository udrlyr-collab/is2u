"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, InlineNotice, Input, Textarea } from "../../../../components/ui";
import { BackButton } from "../../../../components/back-button";
import { PaperConfirmDialog } from "../../../../components/paper-dialog";
import { usePaperSoundSetting } from "../../../../components/paper-sound-provider";
import { apiFetch } from "../../../../lib/client";
import { parseSeoulDateTimeInput, toSeoulDateTimeInput } from "@is2u/core/dates";

type DateEvent = { id: string; startAt: string; endAt: string; title: string | null; note: string | null; status: string };
type Draft = { startAt: string; endAt: string; title: string; note: string };
type Message = { tone: "info" | "error" | "success"; text: string } | null;

function draftFrom(item: DateEvent): Draft {
  return { startAt: toSeoulDateTimeInput(item.startAt), endAt: toSeoulDateTimeInput(item.endAt), title: item.title ?? "", note: item.note ?? "" };
}

export function DateDetail({ id }: { id: string }) {
  const router = useRouter();
  const { play } = usePaperSoundSetting();
  const [item, setItem] = useState<DateEvent | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);

  useEffect(() => {
    apiFetch<{ dateEvent: DateEvent }>(`/api/date-events/${id}`)
      .then((result) => { setItem(result.dateEvent); setDraft(draftFrom(result.dateEvent)); })
      .catch(() => setMessage({ tone: "error", text: "약속을 불러오지 못했어요. 달력에서 다시 열어주세요." }));
  }, [id]);

  function updateDraft(key: keyof Draft, value: string) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    const startAt = parseSeoulDateTimeInput(draft.startAt);
    const endAt = parseSeoulDateTimeInput(draft.endAt);
    if (!startAt || !endAt || endAt <= startAt) {
      setMessage({ tone: "error", text: "끝나는 시간은 시작 시간보다 뒤로 정해 주세요." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ dateEvent: DateEvent }>(`/api/date-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: startAt.toISOString(), endAt: endAt.toISOString(), title: draft.title.trim() || null, note: draft.note.trim() || null }),
      });
      setItem(result.dateEvent);
      setDraft(draftFrom(result.dateEvent));
      setMessage({ tone: "success", text: "약속 메모를 고쳐 붙였어요." });
      play("save-soft");
    } catch {
      setMessage({ tone: "error", text: "변경 내용을 저장하지 못했어요. 입력값은 그대로 두었어요." });
    } finally {
      setSaving(false);
    }
  }

  async function cancelDate() {
    setSaving(true);
    try {
      await apiFetch(`/api/date-events/${id}/cancel`, { method: "POST" });
      play("note-peel");
      router.push("/calendar");
    } catch {
      setMessage({ tone: "error", text: "약속을 취소하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
      setSaving(false);
    }
  }

  async function deleteDate() {
    setSaving(true);
    try {
      await apiFetch(`/api/date-events/${id}`, { method: "DELETE" });
      play("note-peel");
      router.push("/calendar");
    } catch {
      setMessage({ tone: "error", text: "약속을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
      setSaving(false);
    }
  }

  if (!item || !draft) return <p className="muted">약속 메모를 펼치고 있어요…</p>;
  return <>
    <BackButton fallback="/calendar" label="약속으로" />
    <header className="date-detail-heading"><span className="detail-tape" aria-hidden="true" /><p className="paper-label">{item.status === "scheduled" ? "UPCOMING" : item.status.toUpperCase()}</p><h1>{item.title || "함께하는 시간"}</h1></header>
    {item.status !== "cancelled" ? <form className="gentle-form" onSubmit={save}>
      <div className="form-grid">
        <Field label="시작"><Input value={draft.startAt} onChange={(event) => updateDraft("startAt", event.target.value)} name="startAt" type="datetime-local" required /></Field>
        <Field label="끝"><Input value={draft.endAt} onChange={(event) => updateDraft("endAt", event.target.value)} name="endAt" type="datetime-local" required /></Field>
      </div>
      <Field label="짧은 제목"><Input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} name="title" maxLength={80} /></Field>
      <Field label="작은 메모" hint="선택 사항"><Textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} name="note" maxLength={500} rows={3} /></Field>
      <div className="form-actions"><Button disabled={saving}>{saving ? "저장 중…" : "변경 붙이기"}</Button></div>
    </form> : <section className="cancelled-date-note"><p className="paper-label">CANCELLED</p><h2>취소한 약속은 기록으로만 남겨두었어요.</h2><p>다시 수정하지 않고, 필요하면 목록에서 삭제할 수 있어요.</p></section>}
    {message && <InlineNotice tone={message.tone}>{message.text}</InlineNotice>}
    <div className="danger-zone"><p>약속 정리</p><div>{item.status !== "cancelled" && <Button variant="quiet" disabled={saving} onClick={() => setConfirmAction("cancel")}>약속 취소</Button>}<Button variant="danger" disabled={saving} onClick={() => setConfirmAction("delete")}>목록에서 삭제</Button></div></div>
    {confirmAction && <PaperConfirmDialog
      title={confirmAction === "cancel" ? "이 약속을 취소할까요?" : "이 약속을 목록에서 치울까요?"}
      description={confirmAction === "cancel" ? "취소 상태로 목록에 남고, 아직 보내지 않은 미션은 함께 취소해요." : "연결된 기억은 지우지 않고 약속 목록에서만 숨겨요."}
      confirmLabel={confirmAction === "cancel" ? "약속 취소" : "목록에서 삭제"}
      busy={saving}
      onCancel={() => setConfirmAction(null)}
      onConfirm={() => { const action = confirmAction; setConfirmAction(null); if (action === "cancel") void cancelDate(); else void deleteDate(); }}
    />}
  </>;
}
