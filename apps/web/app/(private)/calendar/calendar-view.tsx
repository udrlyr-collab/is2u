"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, KeyboardEvent, PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { expandSeoulDayKeys, parseSeoulDateTimeInput } from "@is2u/core/dates";
import { appointmentView, compareAppointmentDayKeys, compareAppointmentEvents, type AppointmentView } from "@is2u/core/ordering";
import { Button, Field, InlineNotice, Input, StatusSticker } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";

type DateEvent = {
  id: string;
  startAt: string;
  endAt: string;
  title: string | null;
  note: string | null;
  status: "scheduled" | "active" | "completed" | "cancelled";
  updatedAt: string;
  cancelledAt: string | null;
};
type Draft = { startAt: string; endAt: string; title: string };
type Occurrence = { event: DateEvent; dayKey: string; dayIndex: number; dayCount: number };
type Notice = { tone: "error" | "success" | "info"; text: string } | null;

const emptyDraft = (): Draft => ({ startAt: "", endAt: "", title: "" });
const dayHeadingFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
const statusText = { scheduled: "예정", active: "함께 있는 중", completed: "지난 약속", cancelled: "취소" } as const;
const statusTone = { scheduled: "neutral", active: "active", completed: "done", cancelled: "cancelled" } as const;
const viewCopy: Record<AppointmentView, { label: string; description: string }> = {
  upcoming: { label: "다가오는 약속", description: "가까운 약속부터 차례대로 모았어요" },
  past: { label: "지난 약속", description: "최근 지난 약속부터 오래된 순서로 모았어요" },
};

function segmentText(occurrence: Occurrence) {
  if (occurrence.dayCount === 1) return null;
  if (occurrence.dayIndex === 0) return `시작 · 1일차 · ${occurrence.dayCount}일 약속`;
  if (occurrence.dayIndex === occurrence.dayCount - 1) return `마지막 날 · ${occurrence.dayIndex + 1}일차 · ${occurrence.dayCount}일 약속`;
  return `이어지는 약속 · ${occurrence.dayIndex + 1}일차 · ${occurrence.dayCount}일 약속`;
}

function occurrenceTime(occurrence: Occurrence) {
  const start = timeFormatter.format(new Date(occurrence.event.startAt));
  const end = timeFormatter.format(new Date(occurrence.event.endAt));
  if (occurrence.dayCount === 1) return `${start} → ${end}`;
  if (occurrence.dayIndex === 0) return `${start}에 시작`;
  if (occurrence.dayIndex === occurrence.dayCount - 1) return `${end}에 끝`;
  return "하루 동안 이어지는 약속";
}

function AppointmentActions({ occurrence, index, onCancelled, onDeleted, onError }: {
  occurrence: Occurrence;
  index: number;
  onCancelled: (event: DateEvent) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const event = occurrence.event;
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const onPointerDown = (pointerEvent: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(pointerEvent.target as Node)) setOpen(false);
    };
    const onKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function clearLongPress() {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    longPressStart.current = null;
  }

  function startLongPress(pointerEvent: PointerEvent<HTMLElement>) {
    if (pointerEvent.pointerType !== "touch" || (pointerEvent.target as Element).closest("button")) return;
    clearLongPress();
    longPressStart.current = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    longPressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setOpen(true);
      longPressTimer.current = null;
    }, 550);
  }

  function moveLongPress(pointerEvent: PointerEvent<HTMLElement>) {
    if (!longPressStart.current) return;
    if (Math.hypot(pointerEvent.clientX - longPressStart.current.x, pointerEvent.clientY - longPressStart.current.y) > 8) clearLongPress();
  }

  function openFromKeyboard(keyEvent: KeyboardEvent<HTMLElement>) {
    if (keyEvent.key === "ContextMenu" || (keyEvent.shiftKey && keyEvent.key === "F10")) {
      keyEvent.preventDefault();
      setOpen(true);
    }
  }

  function navigateMenu(keyEvent: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)") ?? []);
    if (!items.length) return;
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    if (keyEvent.key === "ArrowDown" || keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault();
      const direction = keyEvent.key === "ArrowDown" ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus();
    } else if (keyEvent.key === "Home" || keyEvent.key === "End") {
      keyEvent.preventDefault();
      items[keyEvent.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (keyEvent.key === "Tab") {
      setOpen(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const result = await apiFetch<{ dateEvent: DateEvent }>(`/api/date-events/${event.id}/cancel`, { method: "POST" });
      onCancelled(result.dateEvent);
      setOpen(false);
    } catch {
      onError("약속을 취소하지 못했어요 잠시 후 다시 시도해 주세요");
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/date-events/${event.id}`, { method: "DELETE" });
      onDeleted(event.id);
      setConfirmDelete(false);
      setOpen(false);
    } catch {
      onError("약속을 목록에서 치우지 못했어요 잠시 후 다시 시도해 주세요");
    } finally { setBusy(false); }
  }

  return <article
    ref={rootRef}
    className="appointment-shell"
    onContextMenu={(contextEvent) => { contextEvent.preventDefault(); setOpen(true); }}
    onPointerDown={startLongPress}
    onPointerUp={clearLongPress}
    onPointerCancel={clearLongPress}
    onPointerMove={moveLongPress}
    onKeyDown={openFromKeyboard}
  >
    <Link
      href={`/dates/${event.id}`}
      className={`appointment-paper appointment-${event.status} paper-tilt-${index % 3}`}
      onClick={(clickEvent) => {
        if (suppressClick.current) { clickEvent.preventDefault(); suppressClick.current = false; }
      }}
    >
      <span className="appointment-pin" aria-hidden="true" />
      <header><h3>{event.title || "함께하는 시간"}</h3><StatusSticker tone={statusTone[event.status]}>{statusText[event.status]}</StatusSticker></header>
      <p className="appointment-time">{occurrenceTime(occurrence)}</p>
      {segmentText(occurrence) && <p className="appointment-segment"><span aria-hidden="true">↝</span>{segmentText(occurrence)}</p>}
      {event.note && <p className="appointment-note">{event.note}</p>}
    </Link>
    <button ref={buttonRef} type="button" className="appointment-menu-button" aria-label={`${event.title || "약속"} 관리 메뉴`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>···</button>
    {open && <div ref={menuRef} id={menuId} className="appointment-menu" role="menu" onKeyDown={navigateMenu}>
      {event.status !== "cancelled" && <Link href={`/dates/${event.id}`} role="menuitem" tabIndex={-1}>약속 수정</Link>}
      {event.status !== "cancelled" && <button type="button" role="menuitem" tabIndex={-1} disabled={busy} onClick={() => void cancel()}>약속 취소</button>}
      <button type="button" role="menuitem" tabIndex={-1} disabled={busy} className="menu-danger" onClick={() => { setOpen(false); setConfirmDelete(true); }}>목록에서 삭제</button>
    </div>}
    {confirmDelete && <PaperConfirmDialog title={`“${event.title || "함께하는 시간"}” 약속을 목록에서 치울까요?`} description="연결된 기억은 지우지 않고 약속 목록에서만 숨겨요" confirmLabel="목록에서 삭제" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
  </article>;
}

export function CalendarView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedView: AppointmentView = searchParams.get("view") === "past" ? "past" : "upcoming";
  const [events, setEvents] = useState<DateEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [clientRequestId, setClientRequestId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ dateEvents: DateEvent[] }>("/api/date-events")
      .then((result) => setEvents(result.dateEvents))
      .catch(() => setNotice({ tone: "error", text: "약속을 불러오지 못했어요 새로고침 뒤 다시 확인해 주세요" }))
      .finally(() => setLoading(false));
  }, []);

  const timeline = useMemo(() => {
    const now = new Date();
    const viewEvents = events.filter((event) => appointmentView(event, now) === selectedView).sort((a, b) => compareAppointmentEvents(a, b, selectedView));
    const occurrences = viewEvents.flatMap((event) => {
      const keys = expandSeoulDayKeys(event.startAt, event.endAt);
      return keys.map((dayKey, dayIndex) => ({ event, dayKey, dayIndex, dayCount: keys.length }));
    });
    const dayKeys = [...new Set(occurrences.map((item) => item.dayKey))].sort((a, b) => compareAppointmentDayKeys(a, b, selectedView));
    return {
      count: viewEvents.length,
      days: dayKeys.map((key) => ({
        key,
        occurrences: occurrences.filter((item) => item.dayKey === key).sort((a, b) => compareAppointmentEvents(a.event, b.event, selectedView)),
      })),
    };
  }, [events, selectedView]);

  function selectView(view: AppointmentView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function updateDraft(key: keyof Draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const startAt = parseSeoulDateTimeInput(draft.startAt);
    const endAt = parseSeoulDateTimeInput(draft.endAt);
    if (!startAt || !endAt || endAt <= startAt) {
      setNotice({ tone: "error", text: "끝나는 시간은 시작 시간보다 뒤로 정해 주세요" });
      return;
    }
    setNotice(null);
    setSaving(true);
    const requestId = clientRequestId || crypto.randomUUID();
    setClientRequestId(requestId);
    try {
      const result = await apiFetch<{ dateEvent: DateEvent }>("/api/date-events", {
        method: "POST",
        body: JSON.stringify({ startAt: startAt.toISOString(), endAt: endAt.toISOString(), title: draft.title.trim() || null, clientRequestId: requestId }),
      });
      setEvents((current) => [...current.filter((item) => item.id !== result.dateEvent.id), result.dateEvent]);
      setDraft(emptyDraft());
      setClientRequestId("");
      setOpen(false);
      setNotice({ tone: "success", text: "새 약속을 서울 시간으로 붙였어요" });
    } catch {
      setNotice({ tone: "error", text: "약속을 저장하지 못했어요 입력한 내용은 그대로 두었으니 잠시 후 다시 시도해 주세요" });
    } finally { setSaving(false); }
  }

  return <section className="calendar-stack">
    <header className="calendar-intro"><div><p className="paper-label">DATE NOTES</p><h1>우리의 약속들</h1><p>지금의 약속부터 지난 메모까지 흐름대로 모았어요</p></div><Button variant="sticker" onClick={() => { setOpen((value) => !value); setNotice(null); }}>{open ? "접어두기" : "+ 새 약속"}</Button></header>
    {open && <form className="date-form" onSubmit={create}>
      <span className="form-tape" aria-hidden="true" />
      <p className="form-note-title">새 약속 메모 · 서울 시간</p>
      <div className="form-grid"><Field label="시작"><Input value={draft.startAt} onChange={(event) => updateDraft("startAt", event.target.value)} name="startAt" type="datetime-local" required /></Field><Field label="끝"><Input value={draft.endAt} onChange={(event) => updateDraft("endAt", event.target.value)} name="endAt" type="datetime-local" required /></Field></div>
      <Field label="짧은 제목" hint="선택 사항"><Input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} name="title" maxLength={80} placeholder="예: 서울 산책" /></Field>
      <div className="form-actions"><Button type="button" variant="quiet" onClick={() => setOpen(false)}>취소</Button><Button disabled={saving}>{saving ? "붙이는 중…" : "약속 붙이기"}</Button></div>
    </form>}
    {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
    <div className="appointment-view-tabs" role="tablist" aria-label="약속 보기"><button type="button" role="tab" aria-selected={selectedView === "upcoming"} onClick={() => selectView("upcoming")}>다가오는 약속</button><button type="button" role="tab" aria-selected={selectedView === "past"} onClick={() => selectView("past")}>지난 약속</button></div>
    {loading ? <p className="empty-list">약속 메모를 펼치고 있어요…</p> : timeline.count === 0 ? <p className="empty-list">{selectedView === "upcoming" ? "다가오는 약속이 없어요" : "지나온 약속이 없어요"}</p> : <div className="calendar-groups">
      <section className={`calendar-group calendar-group-${selectedView}`}>
        <header className="calendar-group-heading"><span>{String(timeline.count).padStart(2, "0")}</span><div><h2>{viewCopy[selectedView].label}</h2><p>{viewCopy[selectedView].description}</p></div></header>
        <div className="calendar-days">{timeline.days.map((day, dayIndex) => <section className="calendar-day" key={`${selectedView}-${day.key}`}>
          <h3 className="calendar-day-heading"><span>{dayHeadingFormatter.format(new Date(`${day.key}T12:00:00+09:00`))}</span><i aria-hidden="true" /></h3>
          <div className="appointment-stack">{day.occurrences.map((occurrence, index) => <AppointmentActions
            key={`${occurrence.event.id}-${occurrence.dayKey}`}
            occurrence={occurrence}
            index={dayIndex + index}
            onCancelled={(updated) => { setEvents((current) => current.map((item) => item.id === updated.id ? updated : item)); setNotice({ tone: "info", text: "취소한 약속은 원래 날짜의 보기에 남겨두었어요" }); }}
            onDeleted={(id) => { setEvents((current) => current.filter((item) => item.id !== id)); setNotice({ tone: "success", text: "약속을 목록에서 치웠어요" }); }}
            onError={(text) => setNotice({ tone: "error", text })}
          />)}</div>
        </section>)}</div>
      </section>
    </div>}
  </section>;
}
