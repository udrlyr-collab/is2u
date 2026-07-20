"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Field, InlineNotice, Input, Textarea } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { DetailBackLink, DetailTopline } from "../../../components/detail-topline";
import { apiFetch } from "../../../lib/client";
import { uploadBoardImage } from "../../../lib/upload-client";
import {
  BOARD_PAPER_SHAPES,
  BOARD_STICKERS,
  BOARD_TEXT_STYLES,
  boardPaperDimensions,
  normalizeBoardPieceStyle,
  type BoardPaperShape,
  type BoardStickerId,
  type BoardTextStyle,
} from "../../../lib/board-style";
import { AttachmentPicker, PaperSwatches, StickerPicker } from "./board-controls";
import { BoardArtwork, BoardNotePaper, MemoryDetailCard } from "./board-renderer";
import { BoardBottomSheet, type BoardBottomSheetHandle } from "./board-bottom-sheet";
import { boundedGroupDelta, clamp as clampNumber, hangingLayout, hangingPath, linkingPaths } from "./board-geometry";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  THREAD_COLORS,
  itemAssetUrl,
  memoryAssetUrl,
  paperLabel,
  shortPaperLabel,
  primaryAsset,
  type BoardItem,
  type BoardMemory,
  type BoardPayload,

  type BoardThread,
  type BoardViewport,
} from "./board-types";

type SaveState = "idle" | "saving" | "saved" | "error";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const BOARD_EXPORT_FOOTER_HEIGHT = 100;
const VIEWPORT_COMMIT_DELAY_MS = 140;
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function boardDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}. ${month}. ${day}` : "";
}

export async function waitForBoardCaptureReady(capture: HTMLElement) {
  await document.fonts.ready;
  const images = Array.from(capture.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error("board_image_load_failed")), { once: true });
      });
    }
    if (!image.naturalWidth) throw new Error("board_image_load_failed");
    await image.decode().catch(() => {
      if (!image.naturalWidth) throw new Error("board_image_decode_failed");
    });
  }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function itemPatch(next: BoardItem) {
  return { id: next.id, x: next.x, y: next.y, width: next.width, height: next.height, rotationTenths: next.rotationTenths, zIndex: next.zIndex, textContent: next.textContent ?? undefined, styleJson: next.styleJson };
}

type SafariGestureEvent = Event & {
  clientX: number;
  clientY: number;
  scale: number;
};

function usePaperDialogFocus(onClose: () => void, initialSelector: string) {
  const dialog = useRef<HTMLElement>(null);
  const closeAction = useRef(onClose);
  useEffect(() => { closeAction.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const root = dialog.current;
      (root?.querySelector<HTMLElement>(initialSelector) ?? root?.querySelector<HTMLElement>("button, input, textarea, select"))?.focus();
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAction.current();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [initialSelector]);
  return dialog;
}

function MemoryPicker({ boardId, mode, usedMemoryCounts, onClose, onDone }: { boardId: string; mode: "attach" | "group"; usedMemoryCounts: Map<string, number>; onClose: () => void; onDone: () => Promise<void> }) {
  const [memories, setMemories] = useState<BoardMemory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [style, setStyle] = useState("butter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attachRequestIds = useRef(new Map<string, string>());
  const dialog = usePaperDialogFocus(onClose, mode === "group" ? ".bundle-name-input" : ".board-memory-choice-list button");
  useEffect(() => { void apiFetch<{ memories: BoardMemory[] }>("/api/board/memories").then(({ memories: loaded }) => setMemories(loaded)).catch(() => setError("추억을 불러오지 못했어요")); }, []);
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  async function submit() {
    if (!selected.length) { setError("붙일 추억을 골라주세요"); return; }
    if (mode === "group" && !name.trim()) { setError("번들 이름을 적어주세요"); return; }
    setBusy(true); setError("");
    const completed: string[] = [];
    try {
      if (mode === "attach") {
        for (const memoryId of selected) {
          const idempotencyKey = attachRequestIds.current.get(memoryId) ?? crypto.randomUUID();
          attachRequestIds.current.set(memoryId, idempotencyKey);
          await apiFetch("/api/board/items", { method: "POST", body: JSON.stringify({ idempotencyKey, boardId, elementType: "memory", memoryId }) });
          attachRequestIds.current.delete(memoryId);
          completed.push(memoryId);
        }
      } else await apiFetch("/api/board/groups", { method: "POST", body: JSON.stringify({ boardId, name: name.trim(), note: note.trim(), style, memoryIds: selected, representativeMemoryId: selected[0] }) });
      await onDone(); onClose();
    } catch {
      if (completed.length) {
        await onDone();
        setSelected((current) => current.filter((memoryId) => !completed.includes(memoryId)));
        setError(`${completed.length}개는 붙였지만 나머지는 붙이지 못했어요`);
      } else setError("추억을 보드에 붙이지 못했어요");
    }
    finally { setBusy(false); }
  }
  return <div className="board-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`board-memory-picker${mode === "group" ? " is-group-picker" : ""}`} role="dialog" aria-modal="true" aria-labelledby="board-picker-title">
      <header><div><p className="paper-label">{mode === "attach" ? "PIN A MEMORY" : "MAKE A BUNDLE"}</p><h2 id="board-picker-title">{mode === "attach" ? "추억 붙이기" : "추억 번들 만들기"}</h2></div><button type="button" onClick={onClose}>닫기</button></header>
      {mode === "group" && <section className="board-group-fields" aria-label="추억 번들 표지 꾸미기">
        <div className="board-group-copy-fields">
          <div><Field label="번들 이름"><Input className="bundle-name-input" maxLength={30} placeholder="이 추억 묶음에 이름을 붙여주세요" value={name} onChange={(event) => setName(event.target.value)} /></Field><small>{name.length}/30</small></div>
          <div><Field label="짧은 메모"><Textarea className="bundle-note-input" maxLength={200} rows={3} placeholder="함께 기억하고 싶은 말을 적어주세요" value={note} onChange={(event) => setNote(event.target.value)} /></Field><small>{note.length}/200</small></div>
        </div>
        <div className="board-group-style-fields">
          <span className="tool-field-label">종이 분위기</span>
          <PaperSwatches value={style} onChange={setStyle} />
          <div className={`board-bundle-cover-preview group-${style}`} aria-label="번들 표지 미리보기">
            <i aria-hidden="true" /><i aria-hidden="true" />
            <strong>{name.trim() || "우리의 추억 번들"}</strong>
            <p>{note.trim() || "함께 묶어둘 짧은 메모"}</p>
            <small>{selected.length ? `${selected.length}개의 추억` : "추억을 골라주세요"}</small>
          </div>
        </div>
      </section>}
      <div className="board-memory-picker-body">
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        <div className="board-memory-choice-list">{memories.map((memory) => {
        const usedCount = mode === "attach" ? usedMemoryCounts.get(memory.id) ?? 0 : 0;
        const asset = primaryAsset(memory);
        return <button key={memory.id} type="button" className={usedCount ? "is-already-used" : ""} aria-pressed={selected.includes(memory.id)} onClick={() => toggle(memory.id)}>
          <div>{asset ? <img src={memoryAssetUrl(asset.id)} alt="" loading="lazy" /> : <span aria-hidden="true">{memory.type === "emotion" ? "✦" : memory.type === "audio" ? "⌁" : "▧"}</span>}{usedCount > 0 && <b className="memory-used-label">{usedCount > 1 ? `사용 중 ${usedCount}` : "사용 중"}</b>}</div>
          <strong>{memory.title}</strong>
          <small>{memory.author.displayName} · {dateFormatter.format(new Date(memory.firstPinnedAt))}</small>
        </button>;
        })}</div>
      </div>
      <footer><span>{selected.length}개 선택{mode === "group" && selected.length ? " · 첫 번째 추억이 표지가 돼요" : ""}</span><Button disabled={busy} onClick={() => void submit()}>{busy ? "붙이는 중…" : mode === "attach" ? "보드에 붙이기" : "번들 만들기"}</Button></footer>
    </section>
  </div>;
}

function NoteDialog({ boardId, onClose, onDone }: { boardId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [shape, setShape] = useState<BoardPaperShape>("note");
  const [textStyle, setTextStyle] = useState<BoardTextStyle>("default");
  const [color, setColor] = useState("butter");
  const [attachment, setAttachment] = useState<"pin" | "tape" | "none">("tape");
  const [text, setText] = useState("");
  const [dateValue, setDateValue] = useState(todayInSeoul);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = usePaperDialogFocus(onClose, "input, textarea");
  const definition = BOARD_PAPER_SHAPES.find((option) => option.id === shape) ?? BOARD_PAPER_SHAPES[0];
  const kind = definition.elementType;
  const dimensions = boardPaperDimensions(kind, shape);
  const content = shape === "date" ? boardDateLabel(dateValue) : text.trim();
  async function save() {
    if (!content) { setError(shape === "date" ? "표시할 날짜를 골라주세요" : "메모 내용을 적어주세요"); return; }
    setBusy(true); setError("");
    try { await apiFetch("/api/board/items", { method: "POST", body: JSON.stringify({ boardId, elementType: kind, textContent: content, styleJson: { color, attachment, shape, textStyle, shadow: "firm" } }) }); await onDone(); onClose(); }
    catch { setError("메모지를 붙이지 못했어요"); }
    finally { setBusy(false); }
  }
  return <div className="board-dialog-backdrop"><section ref={dialog} className="board-note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title"><p className="paper-label">WRITE A LITTLE NOTE</p><h2 id="note-dialog-title">메모지 붙이기</h2>
    <div className="note-preview-box">
      <span className="tool-field-label">완성될 종이 미리보기</span>
      <div className="note-preview-stage">
        <div className={`board-piece note-preview-piece piece-${kind} color-${color} attach-${attachment} shadow-firm`} style={{ position: "relative", width: dimensions.width, height: dimensions.height, transform: "rotate(-1deg)", pointerEvents: "none" }}>
          {attachment === "tape" ? <span className="board-piece-tape" aria-hidden="true" /> : attachment === "pin" ? <span className="board-pin" aria-hidden="true" /> : null}
          <div className="board-piece-surface"><BoardNotePaper shape={shape} textStyle={textStyle}>{content || "여기에 적은 메모가 펼쳐져요"}</BoardNotePaper></div>
        </div>
      </div>
    </div>
    <div><span className="tool-field-label">종이 모양</span><div className="paper-shape-grid">{BOARD_PAPER_SHAPES.map((option) => <button key={option.id} type="button" aria-pressed={shape === option.id} onClick={() => { setShape(option.id); setError(""); }}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div></div>
    <div><span className="tool-field-label">글씨</span><div className="paper-choice-row">{BOARD_TEXT_STYLES.map((option) => <button key={option.id} type="button" aria-pressed={textStyle === option.id} onClick={() => setTextStyle(option.id)}>{option.label}</button>)}</div></div>
    {shape === "date" ? <><Field label="보드에 표시할 날짜"><Input type="date" value={dateValue} autoFocus onChange={(event) => setDateValue(event.target.value)} /></Field><p className="tool-hand-note">약속과 연결되지 않고 보드에 날짜만 표시해요</p></> : <Field label="내용"><Textarea rows={3} maxLength={500} value={text} autoFocus onChange={(event) => setText(event.target.value)} /></Field>}
    <div><span className="tool-field-label">종이색</span><PaperSwatches value={color} onChange={setColor} /></div><div><span className="tool-field-label">붙이는 방법</span><AttachmentPicker value={attachment} onChange={setAttachment} /></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button variant="quiet" onClick={onClose}>닫기</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "붙이고 있어요…" : "종이 붙이기"}</Button></div></section></div>;
}

function StickerDialog({ boardId, onClose, onDone }: { boardId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [sticker, setSticker] = useState<BoardStickerId>("sparkle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = usePaperDialogFocus(onClose, ".board-sticker-grid button");
  const selected = BOARD_STICKERS.find((candidate) => candidate.id === sticker) ?? BOARD_STICKERS[0];

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/board/items", { method: "POST", body: JSON.stringify({ boardId, elementType: "sticker", styleJson: { sticker, attachment: "none", shadow: "soft" } }) });
      await onDone();
      onClose();
    } catch {
      setError("스티커를 붙이지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return <div className="board-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="board-sticker-dialog" role="dialog" aria-modal="true" aria-labelledby="sticker-dialog-title">
      <header><div><p className="paper-label">A LITTLE STICKER</p><h2 id="sticker-dialog-title">스티커 붙이기</h2></div><button type="button" onClick={onClose}>닫기</button></header>
      <p className="sticker-dialog-copy">보드 사이에 작은 표시를 붙여보세요</p>
      <div className="sticker-dialog-preview" aria-label={`${selected.label} 미리보기`}><span className={`sticker-${selected.id}`} aria-hidden="true">{selected.glyph}</span><small>{selected.label}</small></div>
      <StickerPicker value={sticker} onChange={setSticker} />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <div className="form-actions"><Button variant="quiet" onClick={onClose}>닫기</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "붙이는 중…" : "스티커 붙이기"}</Button></div>
    </section>
  </div>;
}

function ShareDialog({ status, message, includeFooter, onIncludeFooterChange, onClose, onShare }: { status: "idle" | "preparing" | "success" | "error"; message: string; includeFooter: boolean; onIncludeFooterChange: (include: boolean) => void; onClose: () => void; onShare: () => void }) {
  return (
    <div className="board-dialog-backdrop board-share-dialog-backdrop">
      <section className="board-share-dialog compact" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <p className="paper-label">KEEP THE BOARD</p>
        <h2 id="share-dialog-title">보드를 한 장의 사진으로 남겨요</h2>
        
        {message && (
          <p className="share-wait-message" style={{ whiteSpace: "pre-line", marginBlock: "0.5rem 1rem", color: "var(--muted-foreground)", fontSize: "0.85rem", textAlign: "center" }}>
            {message}
          </p>
        )}

        <label className="board-share-footer-option">
          <input
            type="checkbox"
            checked={includeFooter}
            disabled={status === "preparing" || status === "success"}
            onChange={(event) => onIncludeFooterChange(event.currentTarget.checked)}
          />
          <span>
            <strong>하단 바 포함</strong>
            <small>보드 이름과 is2u.today를 사진 아래에 함께 남겨요</small>
          </span>
        </label>
        
        <div className="form-actions">
          {status === "idle" && (
            <>
              <Button variant="quiet" onClick={onClose}>닫기</Button>
              <Button onClick={onShare}>사진으로 저장</Button>
            </>
          )}
          {status === "preparing" && (
            <Button disabled>사진을 만들고 있어요…</Button>
          )}
          {status === "success" && (
            <Button onClick={onClose}>완료</Button>
          )}
          {status === "error" && (
            <>
              <Button variant="quiet" onClick={onClose}>닫기</Button>
              <Button onClick={onShare}>다시 시도</Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function BundleSpread({ group, isClosing, onClose, onOpenDetail }: { group: NonNullable<BoardItem["group"]>; isClosing: boolean; onClose: () => void; onOpenDetail: (memoryId: string) => void }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  useEffect(() => { closeAction.current = onClose; });
  useEffect(() => {
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAction.current();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], audio[controls], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return <section ref={dialog} className={`board-bundle-spread${isClosing ? " is-closing" : " is-opening"}`} role="dialog" aria-modal="true" aria-label={`${group.name} 추억 번들`}>
    <div className="bundle-spread-backdrop" aria-hidden="true" onClick={onClose} />
    <header><div><span className="paper-label">MEMORY BUNDLE</span><h2>{group.name}</h2><small>{group.memories.length}개의 추억</small></div><button ref={closeButton} type="button" onClick={onClose}>닫기</button></header>
    {group.note && <p className="bundle-spread-note">{group.note}</p>}
    <div className="bundle-memory-collage">{group.memories.map((memory, index) => { const asset = primaryAsset(memory); return <div key={memory.id} className="bundle-memory-item" style={{ "--bundle-turn": `${(index % 5 - 2) * 0.28}deg`, "--stagger-delay": `${index * 40}ms` } as CSSProperties}><MemoryDetailCard memory={memory} url={asset ? memoryAssetUrl(asset.id) : undefined} onOpen={() => onOpenDetail(memory.id)} /></div>; })}</div>
  </section>;
}

function ThreadMemberOrder({ thread, itemMap, onPreview, onCommit, onDetach }: { thread: BoardThread; itemMap: Map<string, BoardItem>; onPreview: (ids: string[]) => void; onCommit: (ids: string[]) => void; onDetach: (id: string) => void }) {
  const [order, setOrder] = useState(thread.itemIds);
  const orderRef = useRef(thread.itemIds);
  const drag = useRef<{ pointerId: number; index: number } | null>(null);
  useEffect(() => { setOrder(thread.itemIds); orderRef.current = thread.itemIds; }, [thread.id, thread.itemIds]);
  function reorder(from: number, to: number) { if (from === to) return; setOrder((current) => { const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); orderRef.current = next; onPreview(next); return next; }); }
  return <ol className="thread-member-list" aria-label="연결 순서">{order.map((id, index) => { const item = itemMap.get(id); const url = item ? itemAssetUrl(item) : undefined; return <li key={id} data-thread-order={index}>
    <button type="button" className="thread-order-grip" aria-label={`${item ? paperLabel(item) : "추억"} 순서 옮기기`} onPointerDown={(event) => { event.preventDefault(); drag.current = { pointerId: event.pointerId, index }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current?.pointerId !== event.pointerId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-thread-order]"); const targetIndex = Number(target?.dataset.threadOrder); if (Number.isInteger(targetIndex) && targetIndex !== drag.current.index) { const from = drag.current.index; drag.current.index = targetIndex; reorder(from, targetIndex); } }} onPointerUp={(event) => { if (drag.current?.pointerId !== event.pointerId) return; drag.current = null; onCommit(orderRef.current); }} onPointerCancel={() => { drag.current = null; setOrder(thread.itemIds); orderRef.current = thread.itemIds; }}><span aria-hidden="true">≋</span>{url ? <img src={url} alt="" draggable={false} /> : <i aria-hidden="true">▧</i>}<strong>{item ? paperLabel(item) : "추억"}</strong></button>
    <button type="button" onClick={() => onDetach(id)}>실에서 분리하기</button>
  </li>; })}</ol>;
}

export function BoardView({ boardId }: { boardId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<BoardPayload | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [threads, setThreads] = useState<BoardThread[]>([]);
  const [assetOverrides, setAssetOverrides] = useState<Record<string, string>>({});
  const [viewport, setViewport] = useState<BoardViewport>({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"attach" | "group" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "preparing" | "success" | "error">("idle");
  const [includeExportFooter, setIncludeExportFooter] = useState(true);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [bundleClosing, setBundleClosing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const viewportElement = useRef<HTMLDivElement>(null);
  const shareCapture = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<BoardBottomSheetHandle>(null);
  const bundleReturnFocus = useRef<HTMLElement | null>(null);
  const viewportRef = useRef(viewport);
  const itemSaveTimer = useRef<number | null>(null);
  const viewportSaveTimer = useRef<number | null>(null);
  const viewportCommitTimer = useRef<number | null>(null);
  const safariGesture = useRef<{ initialScale: number } | null>(null);
  const safariGestureActions = useRef<{ zoom: (scale: number, clientX: number, clientY: number) => void; commit: () => void } | null>(null);
  const pendingTransform = useRef<BoardItem | null>(null);
  const pendingThreadCurve = useRef<BoardThread | null>(null);
  const loadedOnce = useRef(false);
  const threadDragOrigin = useRef<{ thread: BoardThread; items: Map<string, BoardItem> } | null>(null);
  function saveItem(next: BoardItem) { saveItems([next]); }

  // Centralized high-performance pointer detail tracking
  const activePointers = useRef<Map<number, {
    pointerId: number;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    itemId: string | null;
    isHandle: boolean;
  }>>(new Map());

  const gesture = useRef<{
    type: "none" | "pan" | "pinch" | "item-drag";
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    initialDistance: number;
    initialScale: number;
    centerX: number;
    centerY: number;
    draggedItemIds: string[];
    itemDragOrigins: Map<string, { x: number; y: number }>;
    threadDragOrigin: { thread: BoardThread; items: Map<string, BoardItem> } | null;
    hasMovedPastThreshold: boolean;
  } | null>(null);

  const viewportSizeRef = useRef(viewportSize);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => {
    viewportSizeRef.current = viewportSize;
    fitScaleRef.current = fitScale;
  }, [fitScale, viewportSize]);

  // Flush saves on clean exit
  const pendingItemSave = useRef<{ items: BoardItem[] } | null>(null);
  const pendingViewportSave = useRef<BoardViewport | null>(null);
  const itemSaveInFlight = useRef<Promise<void> | null>(null);
  const viewportSaveInFlight = useRef<Promise<void> | null>(null);
  const saveError = useRef(false);
  const saveFlushActions = useRef<{ items: (keepalive?: boolean) => Promise<void>; viewport: (keepalive?: boolean) => Promise<void> } | null>(null);

  // DOM update batching variables
  const updateQueued = useRef(false);
  const domUpdateFrame = useRef<number | null>(null);
  const nextCanvasTransform = useRef<string | null>(null);
  const nextItemTransforms = useRef<Map<string, string>>(new Map());
  const nextItemGeometry = useRef<Map<string, Pick<BoardItem, "x" | "y" | "width" | "height" | "rotationTenths">>>(new Map());
  const nextThreadPaths = useRef<Map<string, Array<{ selector: string; d: string }>>>(new Map());

  function flushDOMUpdate() {
    if (domUpdateFrame.current !== null) cancelAnimationFrame(domUpdateFrame.current);
    domUpdateFrame.current = null;
    updateQueued.current = false;
    const element = viewportElement.current;
    if (!element) return;
    const canvas = element.querySelector(".board-canvas-fixed") as HTMLElement;

    if (nextCanvasTransform.current && canvas) {
      canvas.style.transform = nextCanvasTransform.current;
      nextCanvasTransform.current = null;
    }

    nextItemGeometry.current.forEach((geometry, id) => {
      const itemElement = element.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
      if (!itemElement) return;
      itemElement.style.left = `${geometry.x}px`;
      itemElement.style.top = `${geometry.y}px`;
      itemElement.style.width = `${geometry.width}px`;
      itemElement.style.height = `${geometry.height}px`;
      itemElement.style.transform = `rotate(${geometry.rotationTenths / 10}deg)`;
    });
    nextItemGeometry.current.clear();

    nextItemTransforms.current.forEach((transform, id) => {
      const itemEl = element.querySelector(`[data-item-id="${id}"]`) as HTMLElement;
      if (itemEl) itemEl.style.transform = transform;
    });
    nextItemTransforms.current.clear();

    nextThreadPaths.current.forEach((paths) => {
      paths.forEach(({ selector, d }) => {
        element.querySelectorAll(selector).forEach((pathElement) => pathElement.setAttribute("d", d));
      });
    });
    nextThreadPaths.current.clear();
  }

  function requestDOMUpdate() {
    if (updateQueued.current) return;
    updateQueued.current = true;
    domUpdateFrame.current = requestAnimationFrame(() => {
      domUpdateFrame.current = null;
      flushDOMUpdate();
    });
  }

  function discardQueuedDOMUpdate() {
    if (domUpdateFrame.current !== null) cancelAnimationFrame(domUpdateFrame.current);
    domUpdateFrame.current = null;
    updateQueued.current = false;
    nextCanvasTransform.current = null;
    nextItemTransforms.current.clear();
    nextItemGeometry.current.clear();
    nextThreadPaths.current.clear();
  }

  function panDOM(targetX: number, targetY: number) {
    const current = viewportRef.current;
    const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.scale));
    const actual = fitScaleRef.current * scale;
    const base = domBasePosition(scale);
    const minX = viewportSizeRef.current.width - BOARD_WIDTH * actual - base.x;
    const maxX = -base.x;
    const minY = viewportSizeRef.current.height - BOARD_HEIGHT * actual - base.y;
    const maxY = -base.y;

    const clampedX = BOARD_WIDTH * actual <= viewportSizeRef.current.width ? 0 : Math.round(Math.min(maxX, Math.max(minX, targetX)));
    const clampedY = BOARD_HEIGHT * actual <= viewportSizeRef.current.height ? 0 : Math.round(Math.min(maxY, Math.max(minY, targetY)));

    viewportRef.current = { x: clampedX, y: clampedY, scale };
    nextCanvasTransform.current = `translate3d(${base.x + clampedX}px, ${base.y + clampedY}px, 0px) scale(${actual})`;
    requestDOMUpdate();
  }

  function zoomAtDOM(targetScale: number, clientX: number, clientY: number) {
    const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetScale));
    const element = viewportElement.current;
    const current = viewportRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    
    const oldBase = domBasePosition(current.scale);
    const boardX = (pointX - oldBase.x - current.x) / (fitScaleRef.current * current.scale);
    const boardY = (pointY - oldBase.y - current.y) / (fitScaleRef.current * current.scale);
    
    const newBase = domBasePosition(target);
    const targetX = pointX - newBase.x - boardX * fitScaleRef.current * target;
    const targetY = pointY - newBase.y - boardY * fitScaleRef.current * target;

    const actual = fitScaleRef.current * target;
    const minX = viewportSizeRef.current.width - BOARD_WIDTH * actual - newBase.x;
    const maxX = -newBase.x;
    const minY = viewportSizeRef.current.height - BOARD_HEIGHT * actual - newBase.y;
    const maxY = -newBase.y;

    const clampedX = BOARD_WIDTH * actual <= viewportSizeRef.current.width ? 0 : Math.round(Math.min(maxX, Math.max(minX, targetX)));
    const clampedY = BOARD_HEIGHT * actual <= viewportSizeRef.current.height ? 0 : Math.round(Math.min(maxY, Math.max(minY, targetY)));

    viewportRef.current = { x: clampedX, y: clampedY, scale: target };
    nextCanvasTransform.current = `translate3d(${newBase.x + clampedX}px, ${newBase.y + clampedY}px, 0px) scale(${actual})`;
    requestDOMUpdate();
  }

  function domBasePosition(scale: number) {
    const actual = fitScaleRef.current * scale;
    return {
      x: (viewportSizeRef.current.width - BOARD_WIDTH * actual) / 2,
      y: (viewportSizeRef.current.height - BOARD_HEIGHT * actual) / 2,
    };
  }

  function dragPreview(
    ids: string[],
    logicalDx: number,
    logicalDy: number,
    origins: Map<string, { x: number; y: number }>,
    hangingOrigin: { thread: BoardThread; items: Map<string, BoardItem> } | null,
  ) {
    if (hangingOrigin) {
      const origin = hangingOrigin.thread;
      const hangingIds = new Set(origin.itemIds);
      const extraItems = ids.filter((id) => !hangingIds.has(id)).map((id) => {
        const item = itemMap.get(id);
        const position = origins.get(id);
        return item && position ? { ...item, x: position.x, y: position.y } : null;
      }).filter((item): item is BoardItem => Boolean(item));
      const allItems = [...hangingOrigin.items.values(), ...extraItems];
      const minItemX = allItems.length ? Math.min(...allItems.map((item) => item.x)) : BOARD_WIDTH;
      const minItemY = allItems.length ? Math.min(...allItems.map((item) => item.y)) : BOARD_HEIGHT;
      const maxItemX = allItems.length ? Math.max(...allItems.map((item) => item.x + item.width)) : 0;
      const maxItemY = allItems.length ? Math.max(...allItems.map((item) => item.y + item.height)) : 0;
      const translated = {
        x: clampNumber(logicalDx, -Math.min(origin.startX, origin.endX, minItemX), BOARD_WIDTH - Math.max(origin.startX, origin.endX, maxItemX)),
        y: clampNumber(logicalDy, -Math.min(origin.startY, origin.endY, minItemY), BOARD_HEIGHT - Math.max(origin.startY, origin.endY, maxItemY)),
      };
      const thread = {
        ...origin,
        startX: Math.round(origin.startX + translated.x),
        startY: Math.round(origin.startY + translated.y),
        endX: Math.round(origin.endX + translated.x),
        endY: Math.round(origin.endY + translated.y),
      };
      const arranged = hangingLayout(thread, hangingOrigin.items);
      const movedExtras = extraItems.map((item) => ({ ...item, x: item.x + translated.x, y: item.y + translated.y }));
      return { items: [...arranged, ...movedExtras], thread };
    }

    const list = ids.map((id) => {
      const item = itemMap.get(id);
      const origin = origins.get(id);
      return item && origin ? { ...item, x: origin.x, y: origin.y } : null;
    }).filter((item): item is BoardItem => Boolean(item));
    const bounded = boundedGroupDelta(list, logicalDx, logicalDy);
    return {
      items: list.map((item) => ({ ...item, x: item.x + bounded.dx, y: item.y + bounded.dy })),
      thread: null,
    };
  }

  function settledThreads(movedThread: BoardThread | null) {
    return movedThread
      ? threads.map((thread) => thread.id === movedThread.id ? movedThread : thread)
      : threads;
  }

  function restoreSettledDragDOM(settledItems: BoardItem[], movedThread: BoardThread | null) {
    const element = viewportElement.current;
    if (!element) return;
    const settledMap = new Map(itemMap);
    settledItems.forEach((item) => {
      settledMap.set(item.id, item);
      const itemElement = element.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`);
      if (itemElement) itemElement.style.transform = `rotate(${item.rotationTenths / 10}deg)`;
    });

    const settledIds = new Set(settledItems.map((item) => item.id));
    settledThreads(movedThread).filter((thread) => thread.itemIds.some((id) => settledIds.has(id))).forEach((thread) => {
      const paths = thread.mode === "linking" ? linkingPaths(thread, settledMap) : [hangingPath(thread)];
      paths.forEach((path, index) => {
        element.querySelectorAll(`[data-thread-id="${thread.id}"] [data-segment-index="${index}"]`).forEach((pathElement) => {
          pathElement.setAttribute("d", path);
        });
      });
    });
  }

  function previewBoardItemsDOM(previewItems: BoardItem[], previewThreads = threads) {
    const previewMap = new Map(itemMap);
    const previewIds = new Set(previewItems.map((item) => item.id));
    previewItems.forEach((item) => {
      previewMap.set(item.id, item);
      nextItemGeometry.current.set(item.id, item);
    });

    previewThreads.filter((thread) => thread.itemIds.some((id) => previewIds.has(id))).forEach((thread) => {
      const paths = thread.mode === "linking" ? linkingPaths(thread, previewMap) : [hangingPath(thread)];
      nextThreadPaths.current.set(thread.id, paths.flatMap((d, index) => [
        { selector: `[data-thread-id="${thread.id}"] .rope-shadow[data-segment-index="${index}"]`, d },
        { selector: `[data-thread-id="${thread.id}"] .rope-cord[data-segment-index="${index}"]`, d },
      ]));
    });
    requestDOMUpdate();
  }

  function dragItemsDOM(
    ids: string[], 
    logicalDx: number, 
    logicalDy: number, 
    origins: Map<string, { x: number; y: number }>,
    threadDragOrigin: { thread: BoardThread; items: Map<string, BoardItem> } | null
  ) {
    const preview = dragPreview(ids, logicalDx, logicalDy, origins, threadDragOrigin);
    const tempItemMap = new Map(itemMap);
    preview.items.forEach((item) => tempItemMap.set(item.id, item));

    preview.items.forEach((item) => {
      const original = itemMap.get(item.id);
      if (!original) return;
      nextItemTransforms.current.set(item.id, `translate3d(${item.x - original.x}px, ${item.y - original.y}px, 0px) rotate(${item.rotationTenths / 10}deg)`);
    });

    const previewIds = new Set(preview.items.map((item) => item.id));
    const connectedThreads = settledThreads(preview.thread).filter((thread) => thread.itemIds.some((id) => previewIds.has(id)));
    connectedThreads.forEach((thread) => {
      const nextPaths = thread.mode === "linking" ? linkingPaths(thread, tempItemMap) : [hangingPath(thread)];
      const selectorPaths: Array<{ selector: string; d: string }> = [];
      nextPaths.forEach((path, idx) => {
        selectorPaths.push({
          selector: `[data-thread-id="${thread.id}"] .rope-shadow[data-segment-index="${idx}"]`,
          d: path
        });
        selectorPaths.push({
          selector: `[data-thread-id="${thread.id}"] .rope-cord[data-segment-index="${idx}"]`,
          d: path
        });
      });
      nextThreadPaths.current.set(thread.id, selectorPaths);
    });

    requestDOMUpdate();
  }

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<BoardPayload>(`/api/board?boardId=${boardId}`);
      setPayload(result); setItems(result.items); setThreads(result.threads);
      const saved = window.sessionStorage.getItem(`is2u-board-return:${boardId}`);
      if (!loadedOnce.current && saved) {
        try { const restored = JSON.parse(saved) as { viewport?: BoardViewport; groupId?: string | null; editMode?: boolean }; if (restored.viewport) { viewportRef.current = restored.viewport; setViewport(restored.viewport); } if (restored.groupId) setOpenGroupId(restored.groupId); if (restored.editMode && result.canEdit) { setEditMode(true); setPanelOpen(true); } } catch { viewportRef.current = { x: 0, y: 0, scale: 1 }; setViewport({ x: 0, y: 0, scale: 1 }); }
        window.sessionStorage.removeItem(`is2u-board-return:${boardId}`);
      } else if (!loadedOnce.current) { const query = new URLSearchParams(window.location.search); const bundle = query.get("bundle"); if (bundle) setOpenGroupId(bundle); viewportRef.current = { x: 0, y: 0, scale: 1 }; setViewport({ x: 0, y: 0, scale: 1 }); }
      loadedOnce.current = true;
      setMessage("");
    } catch { setPayload(null); setMessage("보드를 펼칠 수 없어요"); }
  }, [boardId]);
  useEffect(() => { void load(); }, [load]);
  useLayoutEffect(() => {
    const element = viewportElement.current;
    if (!element) return;
    const syncSize = (width: number, height: number) => {
      const nextSize = { width, height };
      const nextFitScale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT) * 0.94;
      const current = viewportRef.current;
      const actual = nextFitScale * current.scale;
      const baseX = (width - BOARD_WIDTH * actual) / 2;
      const baseY = (height - BOARD_HEIGHT * actual) / 2;
      const nextViewport = {
        x: BOARD_WIDTH * actual <= width ? 0 : Math.round(Math.min(-baseX, Math.max(width - BOARD_WIDTH * actual - baseX, current.x))),
        y: BOARD_HEIGHT * actual <= height ? 0 : Math.round(Math.min(-baseY, Math.max(height - BOARD_HEIGHT * actual - baseY, current.y))),
        scale: current.scale,
      };

      viewportSizeRef.current = nextSize;
      fitScaleRef.current = nextFitScale;
      viewportRef.current = nextViewport;
      setViewportSize(nextSize);
      setFitScale(nextFitScale);
      setViewport((previous) => previous.x === nextViewport.x && previous.y === nextViewport.y && previous.scale === nextViewport.scale ? previous : nextViewport);
    };
    const rect = element.getBoundingClientRect();
    syncSize(rect.width, rect.height);
    const observer = new ResizeObserver(([entry]) => syncSize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [payload?.board?.id]);
  useEffect(() => () => {
    const shouldFlushItems = Boolean(pendingItemSave.current);
    const shouldFlushViewport = Boolean(pendingViewportSave.current);
    if (itemSaveTimer.current !== null) window.clearTimeout(itemSaveTimer.current);
    if (viewportSaveTimer.current !== null) window.clearTimeout(viewportSaveTimer.current);
    if (viewportCommitTimer.current !== null) window.clearTimeout(viewportCommitTimer.current);
    if (domUpdateFrame.current !== null) cancelAnimationFrame(domUpdateFrame.current);
    if (shouldFlushItems) void saveFlushActions.current?.items(true).catch(() => undefined);
    if (shouldFlushViewport) void saveFlushActions.current?.viewport(true).catch(() => undefined);
  }, []);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const selectedItem = selectedItemIds.length === 1 ? itemMap.get(selectedItemIds[0]) ?? null : null;
  const selectedThread = selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) ?? null : null;
  const openGroup = openGroupId ? items.find((item) => item.groupId === openGroupId)?.group ?? null : null;
  const maxZ = Math.max(1, ...items.map((item) => item.zIndex));
  const usedMemoryCounts = new Map<string, number>();
  for (const item of items) {
    if (item.memoryId) usedMemoryCounts.set(item.memoryId, (usedMemoryCounts.get(item.memoryId) ?? 0) + 1);
    for (const memory of item.group?.memories ?? []) usedMemoryCounts.set(memory.id, (usedMemoryCounts.get(memory.id) ?? 0) + 1);
  }
  const effectiveScale = fitScale * viewport.scale;

  function basePosition(scale = viewport.scale) { const actual = fitScale * scale; return { x: (viewportSize.width - BOARD_WIDTH * actual) / 2, y: (viewportSize.height - BOARD_HEIGHT * actual) / 2 }; }
  function clamp(next: BoardViewport): BoardViewport { const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next.scale)); const actual = fitScale * scale; const base = basePosition(scale); const minX = viewportSize.width - BOARD_WIDTH * actual - base.x; const maxX = -base.x; const minY = viewportSize.height - BOARD_HEIGHT * actual - base.y; const maxY = -base.y; return { x: BOARD_WIDTH * actual <= viewportSize.width ? 0 : Math.round(Math.min(maxX, Math.max(minX, next.x))), y: BOARD_HEIGHT * actual <= viewportSize.height ? 0 : Math.round(Math.min(maxY, Math.max(minY, next.y))), scale }; }
  function setView(next: BoardViewport) { const bounded = clamp(next); viewportRef.current = bounded; setViewport(bounded); }

  function settleSaveState() {
    if (pendingItemSave.current || pendingViewportSave.current || itemSaveInFlight.current || viewportSaveInFlight.current) return;
    setSaveState(saveError.current ? "error" : "saved");
  }

  function flushItemSave(keepalive = false): Promise<void> {
    if (itemSaveInFlight.current) return itemSaveInFlight.current;
    const operation = (async () => {
      while (pendingItemSave.current) {
        const targets = pendingItemSave.current.items;
        pendingItemSave.current = null;
        const persisted = targets.filter((item) => !item.id.startsWith("upload-"));
        if (!persisted.length) continue;
        const request = persisted.length === 1
          ? { method: "PATCH", body: JSON.stringify(itemPatch(persisted[0])), keepalive }
          : { method: "PATCH", body: JSON.stringify({ items: persisted.map(itemPatch) }), keepalive };
        try {
          await apiFetch("/api/board/items", request);
        } catch (error) {
          const retry = new Map(targets.map((item) => [item.id, item]));
          const newerPending = pendingItemSave.current as { items: BoardItem[] } | null;
          newerPending?.items.forEach((item) => retry.set(item.id, item));
          pendingItemSave.current = { items: [...retry.values()] };
          throw error;
        }
      }
    })();
    itemSaveInFlight.current = operation;
    void operation.catch(() => { saveError.current = true; setSaveState("error"); }).finally(() => {
      if (itemSaveInFlight.current === operation) itemSaveInFlight.current = null;
      settleSaveState();
    });
    return operation;
  }

  function flushViewportSave(keepalive = false): Promise<void> {
    if (viewportSaveInFlight.current) return viewportSaveInFlight.current;
    const operation = (async () => {
      while (pendingViewportSave.current) {
        const next = pendingViewportSave.current;
        pendingViewportSave.current = null;
        try {
          await apiFetch("/api/board", { method: "PATCH", body: JSON.stringify({ boardId, viewport: next }), keepalive });
        } catch (error) {
          if (!pendingViewportSave.current) pendingViewportSave.current = next;
          throw error;
        }
      }
    })();
    viewportSaveInFlight.current = operation;
    void operation.catch(() => { saveError.current = true; setSaveState("error"); }).finally(() => {
      if (viewportSaveInFlight.current === operation) viewportSaveInFlight.current = null;
      settleSaveState();
    });
    return operation;
  }

  useEffect(() => {
    saveFlushActions.current = { items: flushItemSave, viewport: flushViewportSave };
  });

  function saveItems(targets: BoardItem[]) {
    const merged = new Map((pendingItemSave.current?.items ?? []).map((item) => [item.id, item]));
    targets.forEach((item) => merged.set(item.id, item));
    pendingItemSave.current = { items: [...merged.values()] };
    saveError.current = false;
    if (itemSaveTimer.current !== null) window.clearTimeout(itemSaveTimer.current);
    setSaveState("saving");
    itemSaveTimer.current = window.setTimeout(async () => {
      itemSaveTimer.current = null;
      try {
        await flushItemSave();
      } catch {}
    }, 420);
  }

  function saveViewport(next: BoardViewport) {
    if (!payload?.canEdit) return;
    pendingViewportSave.current = next;
    saveError.current = false;
    if (viewportSaveTimer.current !== null) window.clearTimeout(viewportSaveTimer.current);
    setSaveState("saving");
    viewportSaveTimer.current = window.setTimeout(async () => {
      viewportSaveTimer.current = null;
      try {
        await flushViewportSave();
      } catch {}
    }, 420);
  }

  function commitDOMViewport() {
    const next = { ...viewportRef.current };
    setViewport(next);
    saveViewport(next);
  }

  useEffect(() => {
    safariGestureActions.current = { zoom: zoomAtDOM, commit: commitDOMViewport };
  });

  async function closeDecorating() {
    if (itemSaveTimer.current !== null) {
      window.clearTimeout(itemSaveTimer.current);
      itemSaveTimer.current = null;
    }
    if (viewportSaveTimer.current !== null) {
      window.clearTimeout(viewportSaveTimer.current);
      viewportSaveTimer.current = null;
    }
    try {
      if (pendingItemSave.current) {
        await flushItemSave();
      }
      if (pendingViewportSave.current) {
        await flushViewportSave();
      }
    } catch (err) {
      setMessage("변경 내용을 아직 저장하지 못했어요");
      return;
    }

    setSelectedItemIds([]);
    setSelectedThreadId(null);
    setMultiMode(false);
    setPanelOpen(false);
    setEditMode(false);
  }

  function zoomAt(nextScale: number, clientX?: number, clientY?: number) {
    const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
    const element = viewportElement.current;
    const current = viewportRef.current;
    if (!element || clientX === undefined || clientY === undefined) {
      const next = clamp({ x: target <= 1 ? 0 : current.x, y: target <= 1 ? 0 : current.y, scale: target });
      setView(next);
      saveViewport(next);
      return;
    }
    const rect = element.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const oldBase = basePosition(current.scale);
    const boardX = (pointX - oldBase.x - current.x) / (fitScale * current.scale);
    const boardY = (pointY - oldBase.y - current.y) / (fitScale * current.scale);
    const newBase = basePosition(target);
    const next = clamp({ x: pointX - newBase.x - boardX * fitScale * target, y: pointY - newBase.y - boardY * fitScale * target, scale: target });
    setView(next);
    saveViewport(next);
  }

  // Keep Safari touch and trackpad gestures inside the board surface
  useEffect(() => {
    const el = viewportElement.current;
    if (!el) return;

    const isInteractiveTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".board-bundle-spread, button, a, input, textarea, select"));

    const onTouchStart = (e: TouchEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (e.touches.length > 1 && e.cancelable) {
        e.preventDefault();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const onGestureStart = (event: Event) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.cancelable) event.preventDefault();
      if (activePointers.current.size >= 2) {
        safariGesture.current = null;
        return;
      }
      safariGesture.current = { initialScale: viewportRef.current.scale };
    };

    const onGestureChange = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      if (activePointers.current.size >= 2) {
        safariGesture.current = null;
        return;
      }
      const start = safariGesture.current;
      if (!start) return;
      const gestureEvent = event as SafariGestureEvent;
      if (!Number.isFinite(gestureEvent.scale) || !Number.isFinite(gestureEvent.clientX) || !Number.isFinite(gestureEvent.clientY)) return;
      safariGestureActions.current?.zoom(start.initialScale * gestureEvent.scale, gestureEvent.clientX, gestureEvent.clientY);
    };

    const onGestureEnd = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      if (!safariGesture.current) return;
      safariGesture.current = null;
      safariGestureActions.current?.commit();
    };

    const onWheel = (event: WheelEvent) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.cancelable) event.preventDefault();
      if (safariGesture.current) return;
      const factor = Math.exp(Math.max(-0.35, Math.min(0.35, -event.deltaY * 0.0015)));
      safariGestureActions.current?.zoom(viewportRef.current.scale * factor, event.clientX, event.clientY);
      if (viewportCommitTimer.current !== null) window.clearTimeout(viewportCommitTimer.current);
      viewportCommitTimer.current = window.setTimeout(() => {
        viewportCommitTimer.current = null;
        safariGestureActions.current?.commit();
      }, VIEWPORT_COMMIT_DELAY_MS);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      safariGesture.current = null;
    };
  }, [payload?.board?.id]);

  function startCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".board-bundle-spread, button, a, input, textarea, select")) return;
    
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    const targetPiece = (event.target as HTMLElement).closest("[data-item-id]");
    const itemId = targetPiece?.getAttribute("data-item-id") || null;
    const isHandle = Boolean((event.target as HTMLElement).closest("[data-piece-handle]"));

    activePointers.current.set(event.pointerId, {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      itemId,
      isHandle,
    });

    const values = [...activePointers.current.values()];

    if (values.length === 1) {
      const p = values[0];
      if (editMode && p.isHandle) {
        gesture.current = null;
        return;
      }

      if (editMode && p.itemId && selectedItemIds.includes(p.itemId)) {
        const selectedHangingThreads = threads.filter((thread) => thread.mode === "hanging" && thread.itemIds.some((id) => selectedItemIds.includes(id)));
        if (selectedHangingThreads.length > 1) {
          gesture.current = null;
          setMessage("서로 다른 실에 매단 조각은 한 번에 움직일 수 없어요");
          return;
        }
        const hanging = selectedHangingThreads[0] ?? null;
        const ids = hanging ? [...new Set([...selectedItemIds, ...hanging.itemIds])] : selectedItemIds;
        const origins = new Map<string, { x: number; y: number }>();
        ids.forEach((id) => {
          const item = itemMap.get(id);
          if (item) origins.set(id, { x: item.x, y: item.y });
        });

        const threadOrigin = hanging ? {
          thread: hanging,
          items: new Map(hanging.itemIds.map((id) => itemMap.get(id)).filter((v): v is BoardItem => Boolean(v)).map((v) => [v.id, v]))
        } : null;

        gesture.current = {
          type: "item-drag",
          originX: 0,
          originY: 0,
          startX: p.startX,
          startY: p.startY,
          initialDistance: 0,
          initialScale: 1,
          centerX: 0,
          centerY: 0,
          draggedItemIds: ids,
          itemDragOrigins: origins,
          threadDragOrigin: threadOrigin,
          hasMovedPastThreshold: false,
        };
      } else {
        gesture.current = {
          type: "pan",
          originX: viewportRef.current.x,
          originY: viewportRef.current.y,
          startX: p.startX,
          startY: p.startY,
          initialDistance: 0,
          initialScale: 1,
          centerX: 0,
          centerY: 0,
          draggedItemIds: [],
          itemDragOrigins: new Map(),
          threadDragOrigin: null,
          hasMovedPastThreshold: false,
        };
      }
    } else if (values.length === 2) {
      safariGesture.current = null;
      const previousGesture = gesture.current;
      if (previousGesture?.type === "item-drag") {
        discardQueuedDOMUpdate();
        const originalItems = previousGesture.threadDragOrigin
          ? [...previousGesture.threadDragOrigin.items.values()]
          : previousGesture.draggedItemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
        restoreSettledDragDOM(originalItems, previousGesture.threadDragOrigin?.thread ?? null);
      }
      const p1 = values[0];
      const p2 = values[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const cx = (p1.clientX + p2.clientX) / 2;
      const cy = (p1.clientY + p2.clientY) / 2;

      gesture.current = {
        type: "pinch",
        originX: viewportRef.current.x,
        originY: viewportRef.current.y,
        startX: 0,
        startY: 0,
        initialDistance: dist,
        initialScale: viewportRef.current.scale,
        centerX: cx,
        centerY: cy,
        draggedItemIds: [],
        itemDragOrigins: new Map(),
        threadDragOrigin: null,
        hasMovedPastThreshold: true,
      };
    }
  }

  function moveCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const p = activePointers.current.get(event.pointerId);
    if (!p) return;

    p.clientX = event.clientX;
    p.clientY = event.clientY;

    const g = gesture.current;
    if (!g) return;

    const values = [...activePointers.current.values()];

    if (g.type === "pinch" && values.length === 2) {
      const p1 = values[0];
      const p2 = values[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const factor = dist / Math.max(1, g.initialDistance);
      const targetScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, g.initialScale * factor));
      const cx = (p1.clientX + p2.clientX) / 2;
      const cy = (p1.clientY + p2.clientY) / 2;

      zoomAtDOM(targetScale, cx, cy);
    } else if (values.length === 1) {
      const current = values[0];
      const dist = Math.hypot(current.clientX - current.startX, current.clientY - current.startY);

      if (!g.hasMovedPastThreshold) {
        if (dist > 6) {
          g.hasMovedPastThreshold = true;
        } else {
          return;
        }
      }

      const dx = current.clientX - current.startX;
      const dy = current.clientY - current.startY;

      if (g.type === "pan") {
        panDOM(g.originX + dx, g.originY + dy);
      } else if (g.type === "item-drag") {
        const scale = fitScale * viewportRef.current.scale;
        const logicalDx = dx / Math.max(scale, 0.01);
        const logicalDy = dy / Math.max(scale, 0.01);
        dragItemsDOM(g.draggedItemIds, logicalDx, logicalDy, g.itemDragOrigins, g.threadDragOrigin);
      }
    }
  }

  function endCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const p = activePointers.current.get(event.pointerId);
    if (!p) return;

    p.clientX = event.clientX;
    p.clientY = event.clientY;
    activePointers.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}

    const g = gesture.current;
    if (!g) return;

    const values = [...activePointers.current.values()];

    if (g.type === "pinch") {
      if (values.length === 1) {
        const remaining = values[0];
        gesture.current = {
          type: "pan",
          originX: viewportRef.current.x,
          originY: viewportRef.current.y,
          startX: remaining.clientX,
          startY: remaining.clientY,
          initialDistance: 0,
          initialScale: 1,
          centerX: 0,
          centerY: 0,
          draggedItemIds: [],
          itemDragOrigins: new Map(),
          threadDragOrigin: null,
          hasMovedPastThreshold: true,
        };
      } else {
        gesture.current = null;
        setView(viewportRef.current);
        saveViewport(viewportRef.current);
      }
    } else if (values.length === 0) {
      gesture.current = null;

      const dx = p.clientX - p.startX;
      const dy = p.clientY - p.startY;
      const dist = Math.hypot(dx, dy);

      if (dist <= 6 && !g.hasMovedPastThreshold) {
        // Tap/Click Action
        if (p.itemId) {
          const item = itemMap.get(p.itemId);
          if (item) {
            if (editMode) {
              setSelectedThreadId(null);
              setPanelOpen(true);
              sheetRef.current?.openToMiddle();
              
              applyItemSelection(item.id, multiMode || event.shiftKey, event.shiftKey);
            } else {
              if (item.elementType === "bundle") {
                openBundle(item);
              } else if (item.memoryId) {
                openMemory(item.memoryId);
              }
            }
          }
        } else {
          if (!event.target || !(event.target as HTMLElement).closest(".board-zoom-controls, .board-toolbox, .board-bundle-spread, button, a")) {
            setSelectedItemIds([]);
            setSelectedThreadId(null);
            sheetRef.current?.collapse();
          }
        }
      } else {
        // Drag or Pan ended, commit final coordinates
        if (g.type === "pan") {
          setView(viewportRef.current);
          saveViewport(viewportRef.current);
        } else if (g.type === "item-drag") {
          const scale = fitScaleRef.current * viewportRef.current.scale;
          const logicalDx = dx / Math.max(scale, 0.01);
          const logicalDy = dy / Math.max(scale, 0.01);
          const preview = dragPreview(g.draggedItemIds, logicalDx, logicalDy, g.itemDragOrigins, g.threadDragOrigin);
          const moved = preview.items.map((item) => ({ ...item, x: Math.round(item.x), y: Math.round(item.y) }));
          discardQueuedDOMUpdate();
          restoreSettledDragDOM(moved, preview.thread);
          updateLocals(moved);
          saveItems(moved);
          if (preview.thread) {
            setThreads((current) => current.map((thread) => thread.id === preview.thread!.id ? preview.thread! : thread));
            void apiFetch<{ thread: BoardThread }>("/api/board/threads", {
              method: "PATCH",
              body: JSON.stringify({
                id: preview.thread.id,
                startX: preview.thread.startX,
                startY: preview.thread.startY,
                endX: preview.thread.endX,
                endY: preview.thread.endY,
              }),
            }).then(({ thread }) => {
              setThreads((current) => current.map((value) => value.id === thread.id ? thread : value));
            }).catch(() => {
              setMessage("실의 위치를 저장하지 못했어요");
              void load();
            });
          }
        }
      }
    }
  }

  function cancelCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = activePointers.current.get(event.pointerId);
    if (!pointer) return;

    activePointers.current.delete(event.pointerId);
    const currentGesture = gesture.current;
    if (!currentGesture) return;

    const remainingPointers = [...activePointers.current.values()];
    if (currentGesture.type === "pinch" && remainingPointers.length === 1) {
      const remaining = remainingPointers[0];
      gesture.current = {
        type: "pan",
        originX: viewportRef.current.x,
        originY: viewportRef.current.y,
        startX: remaining.clientX,
        startY: remaining.clientY,
        initialDistance: 0,
        initialScale: 1,
        centerX: 0,
        centerY: 0,
        draggedItemIds: [],
        itemDragOrigins: new Map(),
        threadDragOrigin: null,
        hasMovedPastThreshold: true,
      };
      return;
    }

    if (remainingPointers.length > 0) return;
    gesture.current = null;

    if (currentGesture.type === "pan" || currentGesture.type === "pinch") {
      commitDOMViewport();
      return;
    }

    if (currentGesture.type === "item-drag") {
      discardQueuedDOMUpdate();
      const originalItems = currentGesture.threadDragOrigin
        ? [...currentGesture.threadDragOrigin.items.values()]
        : currentGesture.draggedItemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
      restoreSettledDragDOM(originalItems, currentGesture.threadDragOrigin?.thread ?? null);
    }
  }

  function updateLocal(next: BoardItem) { setItems((current) => current.map((item) => item.id === next.id ? next : item)); }
  function updateLocals(nextItems: BoardItem[]) { const nextMap = new Map(nextItems.map((item) => [item.id, item])); setItems((current) => current.map((item) => nextMap.get(item.id) ?? item)); }
  function applyItemSelection(id: string, additive: boolean, enteredByShift: boolean) {
    const next = additive
      ? selectedItemIds.includes(id) ? selectedItemIds.filter((value) => value !== id) : [...selectedItemIds, id]
      : [id];
    setSelectedItemIds(next);
    if (enteredByShift && next.length > 1) setMultiMode(true);
  }
  function chooseItem(id: string, event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) {
    const item = itemMap.get(id); if (!item) return;
    setSelectedThreadId(null); setPanelOpen(true); sheetRef.current?.openToMiddle();
    const shifted = "shiftKey" in event && event.shiftKey;
    applyItemSelection(id, multiMode || shifted, shifted);
  }
  function transformSelected(change: Partial<BoardItem>) { if (!selectedItem) return; const next = { ...selectedItem, ...change }; pendingTransform.current = null; updateLocal(next); void saveItem(next); }
  function previewSelected(change: Partial<BoardItem>) { if (!selectedItem) return; const next = { ...selectedItem, ...change }; pendingTransform.current = next; previewBoardItemsDOM([next]); }
  function commitSelectedPreview() { const next = pendingTransform.current; if (!next) return; pendingTransform.current = null; previewBoardItemsDOM([next]); flushDOMUpdate(); updateLocal(next); void saveItem(next); }
  function hangingThreadForItem(id: string) { return threads.find((thread) => thread.mode === "hanging" && thread.itemIds.includes(id)) ?? null; }
  function resizeItem(item: BoardItem, width: number, height: number, done: boolean) {
    const next = { ...item, width, height };
    const hanging = hangingThreadForItem(item.id);
    if (hanging) {
      const updatedMap = new Map(itemMap);
      updatedMap.set(item.id, next);
      const arranged = hangingLayout(hanging, updatedMap);
      previewBoardItemsDOM(arranged);
      if (done) { flushDOMUpdate(); updateLocals(arranged); void saveItems(arranged); }
    } else {
      previewBoardItemsDOM([next]);
      if (done) { flushDOMUpdate(); updateLocal(next); void saveItem(next); }
    }
  }
  function rotateItem(item: BoardItem, rotationTenths: number, done: boolean) { const next = { ...item, rotationTenths }; previewBoardItemsDOM([next]); if (done) { flushDOMUpdate(); updateLocal(next); void saveItem(next); } }
  function keyboardMove(item: BoardItem, dx: number, dy: number) {
    const targets = selectedItemIds.length > 1 && selectedItemIds.includes(item.id) ? selectedItemIds.map((id) => itemMap.get(id)).filter((value): value is BoardItem => Boolean(value)) : [item];
    const bounded = boundedGroupDelta(targets, dx, dy); const moved = targets.map((target) => ({ ...target, x: target.x + bounded.dx, y: target.y + bounded.dy })); updateLocals(moved); void saveItems(moved);
  }

  async function uploadImage(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setMessage("PNG, JPG, WEBP 사진만 붙일 수 있어요"); return; }
    const objectUrl = URL.createObjectURL(file); const tempId = `upload-${crypto.randomUUID()}`;
    const temp: BoardItem = { id: tempId, boardId, memoryId: null, groupId: null, assetId: tempId, elementType: "image", textContent: null, styleJson: { attachment: file.type === "image/png" ? "none" : "clip", shadow: "soft" }, x: 220, y: 220, width: 300, height: 240, rotationTenths: 0, zIndex: maxZ + 1, memory: null, group: null, asset: { id: tempId, mimeType: file.type, originalFilename: file.name, status: "uploading" } };
    setItems((current) => [...current, temp]); setAssetOverrides((current) => ({ ...current, [tempId]: objectUrl })); setSelectedItemIds([tempId]); setUploadProgress(0);
    try { await uploadBoardImage(boardId, file, setUploadProgress); await load(); setSelectedItemIds([]); setMessage("사진을 붙였어요"); }
    catch { setItems((current) => current.filter((item) => item.id !== tempId)); setMessage("사진을 붙이지 못했어요 다시 시도해 주세요"); }
    finally { setUploadProgress(null); URL.revokeObjectURL(objectUrl); setAssetOverrides((current) => { const next = { ...current }; delete next[tempId]; return next; }); }
  }

  async function createThread(mode: "hanging" | "linking") {
    const linked = selectedItemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
    if (linked.length < 2 || linked.length !== selectedItemIds.length) { setMessage("연결할 조각을 두 개 이상 골라주세요"); return; }
    let startX = linked[0].x + linked[0].width / 2; let startY = mode === "hanging" ? Math.max(70, Math.min(...linked.map((item) => item.y)) - 44) : linked[0].y + linked[0].height / 2;
    let endX = linked.at(-1)!.x + linked.at(-1)!.width / 2; let endY = mode === "hanging" ? startY : linked.at(-1)!.y + linked.at(-1)!.height / 2;
    if (Math.hypot(endX - startX, endY - startY) < 120) endX = Math.min(BOARD_WIDTH, startX + 420);
    try {
      const { thread } = await apiFetch<{ thread: BoardThread }>("/api/board/threads", { method: "POST", body: JSON.stringify({ boardId, mode, startX: Math.round(startX), startY: Math.round(startY), endX: Math.round(endX), endY: Math.round(endY), color: "warm-brown", itemIds: linked.map((item) => item.id) }) });
      setThreads((current) => [...current, thread]); setSelectedThreadId(thread.id); setSelectedItemIds([]);
      if (mode === "hanging") { const arranged = hangingLayout(thread, itemMap); updateLocals(arranged); await saveItems(arranged); }
      setMessage(mode === "hanging" ? "고른 조각을 실에 매달았어요" : "고른 조각을 실로 이었어요");
    } catch { setMessage("실을 걸지 못했어요"); }
  }
  type ThreadChange = Partial<Pick<BoardThread, "color" | "curve" | "itemIds" | "mode" | "startX" | "startY" | "endX" | "endY">>;
  function previewThread(thread: BoardThread) {
    const previewThreads = threads.map((value) => value.id === thread.id ? thread : value);
    const previewItems = thread.mode === "hanging"
      ? hangingLayout(thread, itemMap)
      : thread.itemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
    previewBoardItemsDOM(previewItems, previewThreads);
  }
  function previewThreadCurve(thread: BoardThread) {
    pendingThreadCurve.current = thread;
    previewThread(thread);
  }
  function commitThreadCurvePreview() {
    const next = pendingThreadCurve.current;
    if (!next) return;
    pendingThreadCurve.current = null;
    flushDOMUpdate();
    void updateThread({ curve: next.curve }, next);
  }
  async function updateThread(change: ThreadChange, base = selectedThread) {
    if (!base) return;
    try {
      const { thread } = await apiFetch<{ thread: BoardThread }>("/api/board/threads", { method: "PATCH", body: JSON.stringify({ id: base.id, ...change }) });
      setThreads((current) => current.map((value) => value.id === thread.id ? thread : value));
      if (thread.mode === "hanging") { const arranged = hangingLayout(thread, new Map(items.map((item) => [item.id, item]))); updateLocals(arranged); await saveItems(arranged); }
      setMessage("실을 바꿨어요");
    } catch { setMessage("실을 바꾸지 못했어요"); void load(); }
  }
  function moveThread(thread: BoardThread, part: "start" | "end" | "whole", dx: number, dy: number, done: boolean) {
    if (!threadDragOrigin.current || threadDragOrigin.current.thread.id !== thread.id) threadDragOrigin.current = { thread, items: new Map(thread.itemIds.map((id) => itemMap.get(id)).filter((value): value is BoardItem => Boolean(value)).map((value) => [value.id, value])) };
    const origin = threadDragOrigin.current.thread;
    const translated = part === "whole" ? {
      x: clampNumber(dx, -Math.min(origin.startX, origin.endX), BOARD_WIDTH - Math.max(origin.startX, origin.endX)),
      y: clampNumber(dy, -Math.min(origin.startY, origin.endY), BOARD_HEIGHT - Math.max(origin.startY, origin.endY)),
    } : { x: dx, y: dy };
    const next = { ...origin,
      startX: part === "end" ? origin.startX : Math.round(clampNumber(origin.startX + translated.x, 0, BOARD_WIDTH)),
      startY: part === "end" ? origin.startY : Math.round(clampNumber(origin.startY + translated.y, 0, BOARD_HEIGHT)),
      endX: part === "start" ? origin.endX : Math.round(clampNumber(origin.endX + translated.x, 0, BOARD_WIDTH)),
      endY: part === "start" ? origin.endY : Math.round(clampNumber(origin.endY + translated.y, 0, BOARD_HEIGHT)),
    };
    const previewThreads = threads.map((value) => value.id === next.id ? next : value);
    const arranged = hangingLayout(next, threadDragOrigin.current.items);
    previewBoardItemsDOM(arranged, previewThreads);
    if (done) {
      flushDOMUpdate();
      threadDragOrigin.current = null;
      setThreads(previewThreads);
      updateLocals(arranged);
      void updateThread({ startX: next.startX, startY: next.startY, endX: next.endX, endY: next.endY }, next);
    }
  }
  async function removeThreadMember(id: string) {
    if (!selectedThread) return; const nextIds = selectedThread.itemIds.filter((value) => value !== id);
    if (nextIds.length < 2) { await deleteThread(); return; }
    const detached = itemMap.get(id); if (detached && selectedThread.mode === "hanging") updateLocal({ ...detached, styleJson: { ...detached.styleJson, attachment: "pin" } });
    await updateThread({ itemIds: nextIds }); setSelectedItemIds([id]); setSelectedThreadId(null);
  }
  async function deleteThread() {
    if (!selectedThread) return;
    try { await apiFetch(`/api/board/threads?id=${selectedThread.id}`, { method: "DELETE" }); const detached = selectedThread.mode === "hanging" ? selectedThread.itemIds.map((id) => itemMap.get(id)).filter((value): value is BoardItem => Boolean(value)).map((item) => ({ ...item, styleJson: { ...item.styleJson, attachment: "pin" } })) : []; updateLocals(detached); setThreads((current) => current.filter((thread) => thread.id !== selectedThread.id)); setSelectedThreadId(null); setMessage("실 연결을 해제했어요"); } catch { setMessage("실 연결을 해제하지 못했어요"); }
  }
  async function detach() { if (!confirmDetach) return; try { await apiFetch(`/api/board/items?id=${confirmDetach}`, { method: "DELETE" }); setItems((current) => current.filter((item) => item.id !== confirmDetach)); setThreads((current) => current.map((thread) => ({ ...thread, itemIds: thread.itemIds.filter((id) => id !== confirmDetach) }))); setConfirmDetach(null); setSelectedItemIds([]); setMessage("보드에서 조각을 떼어냈어요"); } catch { setMessage("보드에서 떼어내지 못했어요"); } }

  function rememberReturn(groupId = openGroupId) { window.sessionStorage.setItem(`is2u-board-return:${boardId}`, JSON.stringify({ viewport: viewportRef.current, groupId, editMode })); }
  function openMemory(memoryId: string) { rememberReturn(); router.push(`/memories/${memoryId}?board=${boardId}`); }
  function openBundle(item: BoardItem) {
    if (!item.groupId || openGroupId) return;
    bundleReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpenGroupId(item.groupId);
    window.history.replaceState(null, "", `/board/${boardId}?bundle=${item.groupId}`);
  }
  function closeBundle() {
    if (bundleClosing) return;
    setBundleClosing(true);
    window.history.replaceState(null, "", `/board/${boardId}`);
      window.setTimeout(() => {
        setOpenGroupId(null);
        setBundleClosing(false);
        if (bundleReturnFocus.current?.isConnected) bundleReturnFocus.current.focus();
        bundleReturnFocus.current = null;
      }, 320);
  }

  async function exportBoard() {
    const capture = shareCapture.current;
    if (!payload?.board || !capture) return;
    const exportHeight = BOARD_HEIGHT + (includeExportFooter ? BOARD_EXPORT_FOOTER_HEIGHT : 0);
    setShareStatus("preparing");
    setShareMessage("보드를 사진으로 준비하고 있어요");

    try {
      await waitForBoardCaptureReady(capture);

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(capture, {
        width: BOARD_WIDTH,
        height: exportHeight,
        scale: 2,
        backgroundColor: "#caa16d",
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: BOARD_WIDTH,
        windowHeight: exportHeight,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("blob_generation_failed");
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const filename = `${payload.board.title.replace(/[\\/:*?"<>|]/g, "-")}-${date}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      let shared = false;
      if (navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 820px)").matches && navigator.share && navigator.canShare?.({ files: [file] })) {
        try { 
          await navigator.share({ files: [file], title: payload.board.title }); 
          shared = true; 
        } catch { 
          shared = false; 
        }
      }

      if (!shared) {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        window.setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 4000);
      }

      setShareStatus("success");
      setShareMessage("보드를 사진으로 남겼어요");
    } catch (error) { 
      console.error("board_share_failed", error); 
      setShareStatus("error");
      setShareMessage("보드를 저장하지 못했어요"); 
    }
  }

  if (!payload?.board) return <div className="board-detail-loading"><DetailTopline back={<DetailBackLink href="/board" label="보드 목록" ariaLabel="보드 목록으로 돌아가기" />} label="OUR CORK BOARD" />{message ? <InlineNotice tone="error">{message}</InlineNotice> : <p>보드를 펼치고 있어요…</p>}</div>;
  const transformBase = basePosition();
  const contextMode = selectedThread ? "thread" : multiMode || selectedItemIds.length > 1 ? "multi" : selectedItem ? selectedItem.elementType === "note" || selectedItem.elementType === "label" ? "note" : "single" : "add";
  const selectedHangingThread = selectedItem ? hangingThreadForItem(selectedItem.id) : null;
  const selectedPaperStyle = selectedItem ? normalizeBoardPieceStyle(selectedItem.styleJson, selectedItem.elementType) : null;
  const compatiblePaperShapes = selectedItem && (selectedItem.elementType === "note" || selectedItem.elementType === "label")
    ? BOARD_PAPER_SHAPES.filter((option) => option.elementType === selectedItem.elementType)
    : [];
  const toolboxTitle = contextMode === "add" || contextMode === "multi" ? "무엇을 붙일까요" : contextMode === "thread" ? "실 다듬기" : `${selectedItem ? shortPaperLabel(selectedItem) : "조각"} 다듬기`;
  return <div className={`memory-board-screen${editMode ? " is-editing" : " is-viewing"}`}>
    <header className="board-detail-header">
      <div className="board-detail-title-area">
        <DetailTopline back={<DetailBackLink href="/board" label="보드 목록" ariaLabel="보드 목록으로 돌아가기" />} label="OUR CORK BOARD" />
        <h1>{payload.board.title}</h1>
        {payload.board.description && <p>{payload.board.description}</p>}
        <small>{payload.owner.displayName}의 보드 · {items.length}개의 조각</small>
      </div>
      <div className="board-detail-actions">
        <Button variant="quiet" onClick={() => { setIncludeExportFooter(true); setShareOpen(true); setShareStatus("idle"); setShareMessage(""); }}>공유</Button>
        {payload.canEdit ? (
          <Button
            aria-pressed={editMode}
            onClick={() => {
              if (editMode) {
                void closeDecorating();
              } else {
                setEditMode(true);
                setPanelOpen(true);
                setMultiMode(false);
                setSelectedItemIds([]);
                setSelectedThreadId(null);
                window.requestAnimationFrame(() => sheetRef.current?.openToMiddle());
              }
            }}
          >
            {editMode ? "꾸미기 끝내기" : "꾸미기"}
          </Button>
        ) : (
          <span className="board-readonly-label">구경하는 중</span>
        )}
      </div>
    </header>
    <div className="board-status-line"><span>{editMode ? "꾸미기 모드" : "보기 모드"}</span><small aria-live="polite">{message || (saveState === "saving" ? "저장 중…" : saveState === "saved" ? "보드를 저장했어요" : saveState === "error" ? "저장하지 못했어요" : "")}</small></div>
    <div className={`board-workspace${editMode && panelOpen ? " has-toolbox" : ""}`}>
      <div ref={viewportElement} className="board-viewport-fixed" onPointerDown={startCanvas} onPointerMove={moveCanvas} onPointerUp={endCanvas} onPointerCancel={cancelCanvas} onLostPointerCapture={cancelCanvas} onDoubleClick={(event) => zoomAt(viewport.scale < 1.5 ? 1.6 : 1, event.clientX, event.clientY)}>
        <div className="board-canvas-fixed" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `translate(${transformBase.x + viewport.x}px, ${transformBase.y + viewport.y}px) scale(${effectiveScale})` }}><BoardArtwork items={items} threads={threads} assetOverrides={assetOverrides} mode={editMode ? "edit" : "view"} scale={effectiveScale} selectedItemIds={selectedItemIds} selectedThreadId={selectedThreadId} onItemSelect={chooseItem} onItemOpen={(item) => item.memoryId && openMemory(item.memoryId)} onBundleOpen={openBundle} onThreadSelect={(id) => { setSelectedThreadId(id); setSelectedItemIds([]); setPanelOpen(true); sheetRef.current?.openToMiddle(); }} onItemResize={resizeItem} onItemRotate={rotateItem} onThreadDrag={moveThread} onKeyboardMove={keyboardMove} /></div>
        {openGroup && <BundleSpread group={openGroup} isClosing={bundleClosing} onClose={closeBundle} onOpenDetail={openMemory} />}
        <div className="board-zoom-controls" aria-label="보드 확대"><button type="button" aria-label="축소" onClick={() => zoomAt(viewport.scale / 1.15)}>−</button><span>{Math.round(viewport.scale * 100)}%</span><button type="button" aria-label="확대" onClick={() => zoomAt(viewport.scale * 1.15)}>+</button><button type="button" onClick={() => { const next = { x: 0, y: 0, scale: 1 }; setView(next); saveViewport(next); }}>전체 보기</button></div>
      </div>
      {payload.canEdit && editMode && panelOpen && <div className="board-toolbox-slot">
      <BoardBottomSheet ref={sheetRef} className={`board-bottom-sheet desktop-toolbox context-${contextMode}`} title={toolboxTitle} headerAction={
          <button type="button" className="multi-mode-toggle" aria-pressed={multiMode} onClick={() => { setMultiMode((current) => !current); setSelectedItemIds([]); setSelectedThreadId(null); }}>
            <span>여러 장 고르기</span>
          </button>
        }>
        {contextMode === "add" && <div className="tool-paper-grid">
          <button type="button" className="board-tool-action action-memory" onClick={() => setPicker("attach")}><span className="board-tool-mark" aria-hidden="true">⌑</span><strong>추억 붙이기</strong><small>보관함에서 골라요</small></button>
          <button type="button" className="board-tool-action action-photo" onClick={() => photoInput.current?.click()}><span className="board-tool-mark" aria-hidden="true">▧</span><strong>사진 붙이기</strong><small>기기에서 가져와요</small></button>
          <input ref={photoInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" tabIndex={-1} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ""; }} />
          <button type="button" className="board-tool-action action-note" onClick={() => setNoteOpen(true)}><span className="board-tool-mark" aria-hidden="true">⌁</span><strong>메모지 붙이기</strong><small>짧은 말을 적어요</small></button>
          <button type="button" className="board-tool-action action-bundle" onClick={() => setPicker("group")}><span className="board-tool-mark" aria-hidden="true">≋</span><strong>추억 번들</strong><small>여러 장을 묶어요</small></button>
          <button type="button" className="board-tool-action action-sticker" onClick={() => setStickerOpen(true)}><span className="board-tool-mark" aria-hidden="true">✦</span><strong>스티커 붙이기</strong><small>작은 장식을 골라요</small></button>
          {uploadProgress !== null && <p className="tool-progress" aria-live="polite">사진을 붙이는 중 {uploadProgress}%</p>}
        </div>}
        {contextMode === "multi" && <div className="tool-section-stack"><ol className="selected-piece-list">{selectedItemIds.map((id, index) => { const item = itemMap.get(id); return item ? <li key={id}><span>{index + 1}</span>{shortPaperLabel(item)}</li> : null; })}</ol><div className="thread-mode-actions"><button type="button" onClick={() => void createThread("hanging")}><i aria-hidden="true">⌁</i><strong>실에 매달기</strong><span>빨래집게로 걸어요</span></button><button type="button" onClick={() => void createThread("linking")}><i aria-hidden="true">↝</i><strong>실로 연결하기</strong><span>지금 자리에서 이어요</span></button></div></div>}
        {(contextMode === "single" || contextMode === "note") && selectedItem && <div className="tool-section-stack">
          {selectedItem.elementType === "image" && selectedItem.asset?.originalFilename && <span className="tool-file-helper" title={selectedItem.asset.originalFilename}>파일: {selectedItem.asset.originalFilename.length > 25 ? `${selectedItem.asset.originalFilename.slice(0, 24)}…` : selectedItem.asset.originalFilename}</span>}
          <div className="compact-adjuster"><span>크기</span><button type="button" aria-label="작게" onClick={() => transformSelected({ width: Math.max(80, selectedItem.width - 24), height: Math.max(60, Math.round(selectedItem.height * Math.max(80, selectedItem.width - 24) / selectedItem.width)) })}>−</button><input key={`${selectedItem.id}-${selectedItem.width}`} aria-label="크기" type="range" min="80" max="720" defaultValue={selectedItem.width} onInput={(event) => { const width = Number(event.currentTarget.value); previewSelected({ width, height: Math.min(620, Math.max(60, Math.round(selectedItem.height * width / selectedItem.width))) }); }} onPointerUp={commitSelectedPreview} onPointerCancel={commitSelectedPreview} onKeyUp={commitSelectedPreview} onBlur={commitSelectedPreview} /><button type="button" aria-label="크게" onClick={() => transformSelected({ width: Math.min(720, selectedItem.width + 24), height: Math.min(620, Math.round(selectedItem.height * Math.min(720, selectedItem.width + 24) / selectedItem.width)) })}>＋</button></div>
          <div className="compact-adjuster"><span>기울기</span><button type="button" aria-label="왼쪽으로 기울이기" onClick={() => transformSelected({ rotationTenths: Math.max(-120, selectedItem.rotationTenths - 10) })}>↶</button><button type="button" onClick={() => transformSelected({ rotationTenths: 0 })}>바로 놓기</button><button type="button" aria-label="오른쪽으로 기울이기" onClick={() => transformSelected({ rotationTenths: Math.min(120, selectedItem.rotationTenths + 10) })}>↷</button></div>
          <div className="paper-choice-row"><button type="button" onClick={() => transformSelected({ zIndex: maxZ + 1 })}>앞으로</button><button type="button" onClick={() => transformSelected({ zIndex: 1 })}>뒤로</button></div>
          {contextMode === "note" && selectedPaperStyle && <>
            <span className="tool-field-label">종이 모양</span>
            <div className="paper-shape-grid compact">{compatiblePaperShapes.map((option) => <button key={option.id} type="button" aria-pressed={selectedPaperStyle.shape === option.id} onClick={() => { const nextSize = boardPaperDimensions(selectedItem.elementType, option.id); transformSelected({ ...nextSize, styleJson: { ...selectedItem.styleJson, shape: option.id, textStyle: selectedPaperStyle.textStyle ?? "default" } }); }}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div>
            <span className="tool-field-label">글씨</span>
            <div className="paper-choice-row">{BOARD_TEXT_STYLES.map((option) => <button key={option.id} type="button" aria-pressed={(selectedPaperStyle.textStyle ?? "default") === option.id} onClick={() => transformSelected({ styleJson: { ...selectedItem.styleJson, shape: selectedPaperStyle.shape, textStyle: option.id } })}>{option.label}</button>)}</div>
            <span className="tool-field-label">종이색</span>
            <PaperSwatches value={selectedItem.styleJson.color ?? "cream"} onChange={(color) => transformSelected({ styleJson: { ...selectedItem.styleJson, color } })} />
          </>}
          {selectedItem.elementType === "memory" && <>
            <span className="tool-field-label">추억 분위기</span>
            <PaperSwatches allowDefault value={selectedItem.styleJson.color ?? ""} label="추억 분위기" onChange={(color) => { const nextStyle = { ...selectedItem.styleJson }; if (color) nextStyle.color = color; else delete nextStyle.color; transformSelected({ styleJson: nextStyle }); }} />
          </>}
          {selectedItem.elementType === "sticker" && <>
            <span className="tool-field-label">스티커 모양</span>
            <StickerPicker value={(BOARD_STICKERS.some((sticker) => sticker.id === selectedItem.styleJson.sticker) ? selectedItem.styleJson.sticker : "sparkle") as BoardStickerId} onChange={(sticker) => transformSelected({ styleJson: { ...selectedItem.styleJson, sticker, attachment: "none" } })} />
          </>}
          {selectedHangingThread ? <button type="button" onClick={() => void removeThreadMember(selectedItem.id)}>실에서 분리하기</button> : selectedItem.elementType !== "sticker" && <><span className="tool-field-label">붙이는 방법</span><AttachmentPicker value={["pin", "tape", "none"].includes(selectedItem.styleJson.attachment ?? "") ? selectedItem.styleJson.attachment! : selectedItem.styleJson.attachment === "clip" ? "none" : "pin"} onChange={(attachment) => transformSelected({ styleJson: { ...selectedItem.styleJson, attachment } })} /></>}
          <button type="button" className="danger paper-detach" onClick={() => setConfirmDetach(selectedItem.id)}>보드에서 떼기</button>
        </div>}
        {contextMode === "thread" && selectedThread && <div className="tool-section-stack"><span className="thread-mode-label">{selectedThread.mode === "hanging" ? "실에 매단 추억" : "실로 이은 추억"}</span><span className="tool-field-label">실 색</span><div className="thread-swatch-list" role="radiogroup" aria-label="실 색">{THREAD_COLORS.map((color) => { const isSelected = selectedThread.color === color.id || (color.id === "warm-brown" && ["beige", "brown", "yellow", "muted-red"].includes(selectedThread.color)); return <button key={color.id} type="button" role="radio" aria-checked={isSelected} className={`thread-swatch-item${isSelected ? " is-selected" : ""}`} onClick={() => void updateThread({ color: color.id })}><div className="thread-swatch-paper"><svg width="100%" height="24" viewBox="0 0 100 20" preserveAspectRatio="none" className="thread-preview-svg"><path d="M 5 6 Q 50 16 95 6" fill="none" stroke="rgba(70, 50, 40, 0.15)" strokeWidth="4" strokeLinecap="round" /><path d="M 5 4 Q 50 14 95 4" fill="none" stroke={color.value} strokeWidth="4" strokeLinecap="round" strokeDasharray="3 1.5" /></svg>{isSelected && <span className="swatch-clothespin" aria-hidden="true" />}</div><span className="thread-swatch-label">{color.label}</span></button>; })}</div><span className="tool-field-label">실 처짐</span><div className="thread-curve-controls"><button onClick={() => void updateThread({ curve: Math.max(-160, selectedThread.curve - 16) })}>팽팽하게</button><input key={`${selectedThread.id}-${selectedThread.curve}`} aria-label="실 처짐" type="range" min="-160" max="160" defaultValue={selectedThread.curve} onInput={(event) => previewThreadCurve({ ...selectedThread, curve: Number(event.currentTarget.value) })} onPointerUp={commitThreadCurvePreview} onPointerCancel={commitThreadCurvePreview} onKeyUp={commitThreadCurvePreview} onBlur={commitThreadCurvePreview} /><button onClick={() => void updateThread({ curve: Math.min(160, selectedThread.curve + 16) })}>더 늘어지게</button></div><span className="tool-field-label">연결 순서</span><ThreadMemberOrder thread={selectedThread} itemMap={itemMap} onPreview={(ids) => previewThread({ ...selectedThread, itemIds: ids })} onCommit={(ids) => void updateThread({ itemIds: ids }, { ...selectedThread, itemIds: ids })} onDetach={(id) => void removeThreadMember(id)} /><button type="button" className="danger paper-detach" onClick={() => void deleteThread()}>실 연결 해제</button></div>}
      </BoardBottomSheet>
      </div>}
    </div>
    {shareOpen && (
      <div className={`board-share-capture${includeExportFooter ? "" : " without-footer"}`} aria-hidden="true" ref={shareCapture}>
        <BoardArtwork items={items.filter((item) => !item.id.startsWith("upload-"))} threads={threads} assetOverrides={assetOverrides} mode="export" />
        {includeExportFooter && (
          <footer className="board-export-footer">
            <div className="export-footer-title">{payload?.board.title}</div>
            <div className="export-footer-brand">
              <span>그대로 멈춰라</span>
              <small>is2u.today</small>
            </div>
          </footer>
        )}
      </div>
    )}
    {picker && <MemoryPicker boardId={boardId} mode={picker} usedMemoryCounts={usedMemoryCounts} onClose={() => setPicker(null)} onDone={load} />}{noteOpen && <NoteDialog boardId={boardId} onClose={() => setNoteOpen(false)} onDone={load} />}{stickerOpen && <StickerDialog boardId={boardId} onClose={() => setStickerOpen(false)} onDone={load} />}{shareOpen && <ShareDialog status={shareStatus} message={shareMessage} includeFooter={includeExportFooter} onIncludeFooterChange={setIncludeExportFooter} onClose={() => setShareOpen(false)} onShare={() => void exportBoard()} />}
    {confirmDetach && <PaperConfirmDialog title="이 조각을 보드에서 떼어낼까요" description="보관함의 원본 추억은 그대로 남아 있어요" cancelLabel="그대로 둘게요" confirmLabel="보드에서 떼기" busy={saveState === "saving"} onCancel={() => setConfirmDetach(null)} onConfirm={() => void detach()} />}
  </div>;
}
