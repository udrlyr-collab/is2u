"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { seoulDayKey } from "@is2u/core/dates";
import { memoryDisplayTitle, userFacingSentence, type MemoryType } from "@is2u/core/types";
import { InlineNotice, StatusSticker } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { PageHeader } from "../../../components/page-shell";
import { apiFetch } from "../../../lib/client";
import { ManualMemoryComposer } from "./manual-memory-composer";

type Asset = { id: string; role: "preview" | "thumbnail" | "poster"; mimeType: string; processingStatus: string };
type Memory = { id: string; type: MemoryType; customTitle: string | null; text: string | null; emotion: string | null; createdAt: string; firstPinnedAt: string; updatedAt: string; assets: Asset[] };
type Person = { id: string; displayName: string; roleLabel: string };
type Entry = {
  id: string;
  kind: "mission" | "manual";
  type: MemoryType;
  status: "scheduled" | "sent" | "completed" | "skipped" | "expired" | "cancelled";
  isTest: boolean;
  source: string;
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  displayAt: string;
  recipient: Person;
  dateEvent: { id: string; title: string | null; startAt: string; endAt: string; status: string; deletedAt: string | null } | null;
  copy: { title: string; prompt: string } | null;
  canOpen: boolean;
  canManage: boolean;
  canEdit: boolean;
  canCancel: boolean;
  memory: Memory | null;
};
type Payload = { currentUserId: string; activeCouple: { id: string; partner: Person } | null; recipients: Person[]; entries: Entry[] };

const dayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
const statusCopy = {
  scheduled: { label: "기다리는 중", tone: "neutral" },
  sent: { label: "지금 해야 해요", tone: "active" },
  completed: { label: "보관 완료", tone: "done" },
  skipped: { label: "그냥 지나감", tone: "neutral" },
  expired: { label: "시간이 지남", tone: "expired" },
  cancelled: { label: "취소", tone: "cancelled" },
} as const;

function pickPreview(entry: Entry): Asset | undefined {
  const ready = entry.memory?.assets.filter((asset) => asset.processingStatus === "ready") ?? [];
  if (entry.type === "photo") return ready.find((asset) => asset.role === "thumbnail") ?? ready.find((asset) => asset.role === "preview");
  if (entry.type === "video" || entry.type === "manual_video") return ready.find((asset) => asset.role === "poster") ?? ready.find((asset) => asset.role === "thumbnail");
  if (entry.type === "audio") return ready.find((asset) => asset.role === "preview");
  return undefined;
}

function EntryPreview({ entry, url }: { entry: Entry; url?: string }) {
  if (entry.memory?.type === "text") return <blockquote className="mission-text-preview">“{entry.memory.text}”</blockquote>;
  if (entry.memory?.type === "emotion") return <div className="mission-emotion-preview"><span aria-hidden="true">✦</span>{entry.memory.emotion}</div>;
  if (entry.type === "photo" || entry.type === "video" || entry.type === "manual_video") return url
    ? <div className={`mission-media-preview preview-${entry.type === "photo" ? "photo" : "video"}`}><img src={url} alt={entry.type === "photo" ? "사진 추억 미리보기" : "영상 추억 포스터"} />{entry.type !== "photo" && <span className="video-mark" aria-hidden="true">▶</span>}</div>
    : <div className="mission-placeholder"><span aria-hidden="true">▧</span>{entry.memory ? "미리보기를 준비하고 있어요" : userFacingSentence(entry.copy?.prompt ?? "")}</div>;
  if (entry.type === "audio") return <div className="audio-preview"><span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span><small>{url ? "펼쳐서 목소리 듣기" : entry.memory ? "목소리를 준비하고 있어요" : userFacingSentence(entry.copy?.prompt ?? "")}</small></div>;
  return <p className="mission-prompt-preview">{userFacingSentence(entry.copy?.prompt ?? "")}</p>;
}

function MemorySlip({ entry, url, index, onRemoved, onCancelled, onError }: {
  entry: Entry;
  url?: string;
  index: number;
  onRemoved: (entry: Entry) => void;
  onCancelled: (entry: Entry) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const menuId = useId();
  const instructionId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPoint, setMenuPoint] = useState({ left: 8, top: 8 });
  const [longPressing, setLongPressing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = statusCopy[entry.status];
  const role = entry.recipient.roleLabel === "남자친구" ? "boyfriend" : "girlfriend";
  const title = memoryDisplayTitle({ type: entry.memory?.type ?? entry.type, customTitle: entry.memory?.customTitle, missionTitle: entry.copy?.title });
  const personLabel = entry.kind === "mission" ? `${entry.recipient.roleLabel}에게 온 미션` : `${entry.recipient.displayName} · ${entry.recipient.roleLabel}`;
  const appointmentTitle = !entry.isTest && entry.source !== "manual_random" && !entry.dateEvent?.deletedAt ? entry.dateEvent?.title : null;
  const detailHref = entry.kind === "manual" ? `/memories/${entry.id}` : `/missions/${entry.id}`;
  const canEdit = entry.status === "completed" && entry.canEdit && Boolean(entry.memory);
  const hasMenu = entry.canOpen || entry.canCancel || canEdit || entry.canManage;
  const instruction = entry.canOpen
    ? hasMenu ? "Enter로 열고 Shift와 F10을 눌러 관리할 수 있어요" : "Enter로 열 수 있어요"
    : hasMenu ? "Shift와 F10을 눌러 관리할 수 있어요" : "읽기 전용 추억이에요";

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuOpen(false);
    if (restoreFocus) window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
    };
    const onResize = () => closeMenu(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  }, []);

  function positionMenu(left: number, top: number) {
    const place = () => {
      const width = menuRef.current?.offsetWidth ?? 176;
      const height = menuRef.current?.offsetHeight ?? 160;
      setMenuPoint({
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
      });
      menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(place));
  }

  function openMenuAt(left: number, top: number) {
    if (!hasMenu) return;
    cardRef.current?.focus({ preventScroll: true });
    setMenuPoint({ left, top });
    setMenuOpen(true);
    positionMenu(left, top);
  }

  function openMenuFromCard() {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    openMenuAt(rect.left + Math.min(rect.width * 0.66, rect.width - 24), rect.top + Math.min(54, rect.height - 24));
  }

  function cancelLongPress() {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pointerStart.current = null;
    setLongPressing(false);
  }

  function startLongPress(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !hasMenu || menuRef.current?.contains(event.target as Node)) return;
    cancelLongPress();
    pointerStart.current = { x: event.clientX, y: event.clientY };
    setLongPressing(true);
    const point = { x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => {
      suppressClickUntil.current = Date.now() + 900;
      openMenuAt(point.x, point.y);
      try { navigator.vibrate?.(12); } catch { /* 진동 없이도 메뉴는 열린다 */ }
      cancelLongPress();
    }, 520);
  }

  function moveLongPress(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    if (Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 10) cancelLongPress();
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openMenuFromCard();
      return;
    }
    if (entry.canOpen && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      router.push(detailHref);
    }
  }

  function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)") ?? []);
    if (!items.length) return;
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  async function cancelMission() {
    setBusy(true);
    try {
      await apiFetch(`/api/missions/${entry.id}/cancel`, { method: "POST" });
      closeMenu(false);
      onCancelled(entry);
    } catch { onError("미션을 취소하지 못했어요 잠시 뒤 다시 시도해 주세요"); }
    finally { setBusy(false); }
  }

  async function removeEntry() {
    setBusy(true);
    try {
      await apiFetch(entry.kind === "manual" ? `/api/memories/${entry.id}` : `/api/missions/${entry.id}`, { method: "DELETE" });
      setConfirmRemove(false);
      onRemoved(entry);
    } catch {
      onError("이 추억을 떼어내지 못했어요 권한을 확인해 주세요");
      setConfirmRemove(false);
    } finally { setBusy(false); }
  }

  const body = <article
    ref={cardRef}
    className={`mission-slip slip-${entry.status} slip-${index % 3} person-${role} memory-type-${entry.memory?.type ?? entry.type}${entry.kind === "manual" ? " memory-manual" : ""}`}
    tabIndex={0}
    role={entry.canOpen ? "link" : undefined}
    aria-label={`${title} 추억`}
    aria-describedby={instructionId}
    aria-haspopup={hasMenu ? "menu" : undefined}
    aria-expanded={hasMenu ? menuOpen : undefined}
    aria-controls={hasMenu ? menuId : undefined}
    onKeyDown={handleCardKeyDown}
    onClick={() => {
      if (Date.now() < suppressClickUntil.current) return;
      if (menuOpen) { closeMenu(false); return; }
      if (entry.canOpen) router.push(detailHref);
    }}
  >
    <span className="slip-tape" aria-hidden="true" />
    <header><h3>{title}</h3><StatusSticker tone={status.tone}>{status.label}</StatusSticker></header>
    <EntryPreview entry={entry} url={url} />
    <div className="memory-card-meta"><span>{timeFormatter.format(new Date(entry.memory?.firstPinnedAt ?? entry.displayAt))}</span><span className={`recipient-name-tag recipient-${role}`}>{personLabel}</span></div>
    <footer>{appointmentTitle && <span>{appointmentTitle}</span>}{entry.canOpen && <strong>{entry.status === "completed" ? "자세히 보기 →" : "쪽지 열기 →"}</strong>}</footer>
  </article>;
  return <div
    ref={shellRef}
    className={`memory-slip-shell${hasMenu ? " manageable" : ""}${longPressing ? " long-pressing" : ""}`}
    onContextMenu={(event) => { if (hasMenu) { event.preventDefault(); openMenuAt(event.clientX, event.clientY); } }}
    onPointerDown={startLongPress}
    onPointerMove={moveLongPress}
    onPointerUp={cancelLongPress}
    onPointerCancel={cancelLongPress}
  >
    <span id={instructionId} className="visually-hidden">{instruction}</span>
    {body}
    {menuOpen && <div ref={menuRef} id={menuId} role="menu" aria-label={`${title} 관리`} className="memory-paper-menu" style={{ left: menuPoint.left, top: menuPoint.top }} onKeyDown={navigateMenu}>
      {entry.canOpen && <Link role="menuitem" tabIndex={-1} href={detailHref} onClick={() => closeMenu(false)}>{entry.status === "sent" ? "미션 열기" : "추억 열기"}</Link>}
      {entry.canCancel && <button role="menuitem" tabIndex={-1} type="button" disabled={busy} onClick={() => void cancelMission()}>미션 취소</button>}
      {canEdit && <Link role="menuitem" tabIndex={-1} href={`${detailHref}?edit=1`} onClick={() => closeMenu(false)}>수정하기</Link>}
      {entry.canManage && <button role="menuitem" tabIndex={-1} type="button" className="danger" disabled={busy} onClick={() => { closeMenu(false); setConfirmRemove(true); }}>추억 떼기</button>}
    </div>}
    {confirmRemove && <PaperConfirmDialog
      title={entry.kind === "mission" && ["cancelled", "expired", "skipped"].includes(entry.status) ? "이 미션을 추억 목록에서 떼어낼까요" : "이 추억을 여기서 떼어낼까요"}
      description={entry.kind === "mission" && ["cancelled", "expired", "skipped"].includes(entry.status) ? "더 이상 목록에 보이지 않아요" : "떼어낸 추억은 잠시 동안 되돌릴 수 있어요"}
      cancelLabel="아직 남겨둘게요"
      confirmLabel="추억 떼기"
      busy={busy}
      onCancel={() => setConfirmRemove(false)}
      onConfirm={() => void removeEntry()}
    />}
  </div>;
}

export function MissionBoard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [managementHint, setManagementHint] = useState("");
  const hintChecked = useRef(false);
  const hintTimer = useRef<number | null>(null);

  function removeFromBoard(entry: Entry) {
    setPayload((current) => current ? { ...current, entries: current.entries.filter((item) => !(item.id === entry.id && item.kind === entry.kind)) } : current);
  }

  function cancelOnBoard(entry: Entry) {
    setPayload((current) => current ? { ...current, entries: current.entries.map((item) => item.id === entry.id && item.kind === entry.kind ? { ...item, status: "cancelled", canCancel: false } : item) } : current);
  }

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>("/api/missions");
      setPayload(result);
      setError("");
      const candidates = result.entries.map((entry) => pickPreview(entry)).filter((asset): asset is Asset => Boolean(asset));
      const signed = await Promise.all(candidates.map(async (asset) => {
        try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
        catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch { setError("추억을 불러오지 못했어요 잠시 뒤 다시 펼쳐주세요"); }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    if (!payload || hintChecked.current || !payload.entries.some((entry) => entry.canManage || entry.canCancel || entry.canEdit)) return;
    hintChecked.current = true;
    const storageKey = `is2u:memory-management-hint:v1:${payload.currentUserId}`;
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, "shown");
    } catch { /* 저장소를 쓸 수 없어도 기능은 계속 동작한다 */ }
    const desktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setManagementHint(desktop ? "추억을 우클릭하면 수정하거나 떼어낼 수 있어요" : "추억을 길게 누르면 수정하거나 떼어낼 수 있어요");
    hintTimer.current = window.setTimeout(() => setManagementHint(""), 6_500);
  }, [payload]);

  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
  }, []);

  if (!payload && !error) return <div className="board-loading"><span aria-hidden="true" />추억을 꺼내고 있어요…</div>;

  return <div className="mission-board">
    <PageHeader label="OUR LITTLE MEMORIES" title="우리의 추억" action={<ManualMemoryComposer onSaved={() => void load()} randomMissionEnabled={Boolean(payload?.activeCouple)} />} />
    {payload && !payload.activeCouple && <aside className="connection-onboarding"><span className="paper-tape" aria-hidden="true" /><p className="paper-label">WAITING FOR TWO</p><h2>아직 혼자 쓰는 추억 상자예요</h2><p>상대와 연결하면 함께 약속을 만들고 미션을 받을 수 있어요 지금은 내 추억을 자유롭게 남길 수 있어요</p><Link href="/settings#connection">상대와 연결하기 →</Link></aside>}
    {managementHint && <aside className="memory-management-hint" role="status"><span>{managementHint}</span><button type="button" onClick={() => setManagementHint("")}>닫기</button></aside>}
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {payload && payload.entries.length === 0 && <section className="empty-board"><span className="empty-tape" aria-hidden="true" /><h2>아직 붙여둔 추억이 없어요</h2><p>추억을 직접 남기거나 약속 중 도착한 미션을 열어보세요</p></section>}
    {payload && <section className="unified-timeline">{[...new Set(payload.entries.map((entry) => seoulDayKey(entry.displayAt)))].map((day) => {
      const dayEntries = payload.entries.filter((entry) => seoulDayKey(entry.displayAt) === day);
      const appointmentTitles = [...new Set(dayEntries.flatMap((entry) => {
        if (entry.isTest || entry.source === "manual_random" || entry.dateEvent?.deletedAt || !entry.dateEvent?.title) return [];
        return [entry.dateEvent.title];
      }))];
      return <div className="mission-day" key={day}>
        <h2 className="day-divider"><span>{dayFormatter.format(new Date(dayEntries[0].displayAt))}</span>{appointmentTitles.length > 0 && <span className="day-appointment-stickers">{appointmentTitles.map((title) => <b key={title}>{title}</b>)}</span>}<i aria-hidden="true" /></h2>
        <div className="mission-slips">{dayEntries.map((entry, index) => { const preview = pickPreview(entry); return <MemorySlip key={`${entry.kind}-${entry.id}`} entry={entry} url={preview ? urls[preview.id] : undefined} index={index} onRemoved={removeFromBoard} onCancelled={cancelOnBoard} onError={setError} />; })}</div>
      </div>;
    })}</section>}
  </div>;
}
