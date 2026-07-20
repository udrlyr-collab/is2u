"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Button, Field, InlineNotice, Input, Textarea } from "../../../components/ui";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";
import { uploadBoardImage } from "../../../lib/upload-client";
import { BoardArtwork, MemoryDetailCard } from "./board-renderer";
import { BoardBottomSheet, type BoardBottomSheetHandle } from "./board-bottom-sheet";
import { boundedGroupDelta, clamp as clampNumber, hangingLayout } from "./board-geometry";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PAPER_COLORS,
  THREAD_COLORS,
  isThreadable,
  itemAssetUrl,
  memoryAssetUrl,
  paperLabel,
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
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function PaperSwatches({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="paper-swatch-grid" role="radiogroup" aria-label="종이색">{PAPER_COLORS.map((color, index) => <button key={color.id} type="button" role="radio" aria-checked={value === color.id} onClick={() => onChange(color.id)} style={{ "--swatch-color": color.value, "--swatch-turn": `${(index % 3 - 1) * 0.6}deg` } as CSSProperties}><i aria-hidden="true" /> <span>{color.label}</span>{value === color.id && <b aria-hidden="true">✓</b>}</button>)}</div>;
}

function MemoryPicker({ boardId, mode, existingMemoryIds, onClose, onDone }: { boardId: string; mode: "attach" | "group"; existingMemoryIds: Set<string>; onClose: () => void; onDone: () => Promise<void> }) {
  const [memories, setMemories] = useState<BoardMemory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [style, setStyle] = useState("butter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void apiFetch<{ memories: BoardMemory[] }>("/api/board/memories").then(({ memories: loaded }) => setMemories(loaded)).catch(() => setError("추억을 불러오지 못했어요")); }, []);
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  async function submit() {
    if (!selected.length) { setError("붙일 추억을 골라주세요"); return; }
    if (mode === "group" && !name.trim()) { setError("번들 이름을 적어주세요"); return; }
    setBusy(true); setError("");
    try {
      if (mode === "attach") for (const memoryId of selected) await apiFetch("/api/board/items", { method: "POST", body: JSON.stringify({ boardId, elementType: "memory", memoryId }) });
      else await apiFetch("/api/board/groups", { method: "POST", body: JSON.stringify({ boardId, name: name.trim(), note: note.trim(), style, memoryIds: selected, representativeMemoryId: selected[0] }) });
      await onDone(); onClose();
    } catch { setError("추억을 보드에 붙이지 못했어요"); }
    finally { setBusy(false); }
  }
  return <div className="board-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="board-memory-picker" role="dialog" aria-modal="true" aria-labelledby="board-picker-title"><header><div><p className="paper-label">{mode === "attach" ? "PIN A MEMORY" : "MAKE A BUNDLE"}</p><h2 id="board-picker-title">{mode === "attach" ? "추억 붙이기" : "추억 번들 만들기"}</h2></div><button type="button" onClick={onClose}>닫기</button></header>{mode === "group" && <div className="board-group-fields"><Field label="번들 이름"><Input maxLength={30} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="짧은 메모"><Textarea maxLength={200} rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field><div><span className="tool-field-label">종이 분위기</span><PaperSwatches value={style} onChange={setStyle} /></div></div>}{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="board-memory-choice-list">{memories.map((memory) => { const attached = mode === "attach" && existingMemoryIds.has(memory.id); const asset = primaryAsset(memory); return <button key={memory.id} type="button" disabled={attached} aria-pressed={selected.includes(memory.id)} onClick={() => toggle(memory.id)}><div>{asset ? <img src={memoryAssetUrl(asset.id)} alt="" loading="lazy" /> : <span aria-hidden="true">{memory.type === "emotion" ? "✦" : memory.type === "audio" ? "⌁" : "▧"}</span>}</div><strong>{memory.title}</strong><small>{attached ? "이미 붙여뒀어요" : `${memory.author.displayName} · ${dateFormatter.format(new Date(memory.firstPinnedAt))}`}</small></button>; })}</div><footer><span>{selected.length}개 선택</span><Button disabled={busy} onClick={() => void submit()}>{busy ? "붙이는 중…" : mode === "attach" ? "보드에 붙이기" : "번들 만들기"}</Button></footer></section></div>;
}

function NoteDialog({ boardId, onClose, onDone }: { boardId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [kind, setKind] = useState<"note" | "label">("note");
  const [shape, setShape] = useState("note");
  const [color, setColor] = useState("butter");
  const [attachment, setAttachment] = useState("tape");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!text.trim()) { setError("메모 내용을 적어주세요"); return; }
    setBusy(true); setError("");
    try { await apiFetch("/api/board/items", { method: "POST", body: JSON.stringify({ boardId, elementType: kind, textContent: text, styleJson: { color, attachment, shape, shadow: "firm" } }) }); await onDone(); onClose(); }
    catch { setError("메모지를 붙이지 못했어요"); }
    finally { setBusy(false); }
  }
  const shapes = [{ id: "note:note", label: "메모지" }, { id: "note:speech", label: "말풍선 메모" }, { id: "label:title", label: "제목 라벨" }, { id: "label:scribble", label: "낙서형 텍스트" }, { id: "label:date", label: "날짜 라벨" }, { id: "note:caption", label: "짧은 설명 카드" }];
  return <div className="board-dialog-backdrop"><section className="board-note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title"><p className="paper-label">WRITE A LITTLE NOTE</p><h2 id="note-dialog-title">메모지 붙이기</h2><div><span className="tool-field-label">모양</span><div className="paper-choice-row">{shapes.map((option) => <button key={option.id} type="button" aria-pressed={`${kind}:${shape}` === option.id} onClick={() => { const [nextKind, nextShape] = option.id.split(":"); setKind(nextKind as "note" | "label"); setShape(nextShape); }}>{option.label}</button>)}</div></div><Field label="내용"><Textarea rows={4} maxLength={500} value={text} autoFocus onChange={(event) => setText(event.target.value)} /></Field><div><span className="tool-field-label">종이색</span><PaperSwatches value={color} onChange={setColor} /></div><div><span className="tool-field-label">붙이는 방법</span><div className="paper-choice-row">{[{ id: "tape", label: "테이프" }, { id: "pin", label: "압정" }, { id: "none", label: "그대로" }].map((option) => <button key={option.id} type="button" aria-pressed={attachment === option.id} onClick={() => setAttachment(option.id)}>{option.label}</button>)}</div></div>{error && <InlineNotice tone="error">{error}</InlineNotice>}<div className="form-actions"><Button variant="quiet" onClick={onClose}>닫기</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "붙이고 있어요…" : "메모지 붙이기"}</Button></div></section></div>;
}

function ShareDialog({ busy, onClose, onShare }: { busy: boolean; onClose: () => void; onShare: () => void }) {
  return <div className="board-dialog-backdrop"><section className="board-share-dialog compact" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title"><p className="paper-label">KEEP THE BOARD</p><h2 id="share-dialog-title">보드를 한 장의 사진으로 남겨요</h2><div className="form-actions"><Button variant="quiet" disabled={busy} onClick={onClose}>닫기</Button><Button disabled={busy} onClick={onShare}>{busy ? "사진을 만들고 있어요…" : "사진으로 저장"}</Button></div></section></div>;
}

function BundleSpread({ group, onClose, onOpenDetail }: { group: NonNullable<BoardItem["group"]>; onClose: () => void; onOpenDetail: (memoryId: string) => void }) {
  return <section className="board-bundle-spread" aria-label={`${group.name} 추억 번들`}>
    <div className="bundle-spread-backdrop" aria-hidden="true" />
    <header><div><span className="paper-label">MEMORY BUNDLE</span><h2>{group.name}</h2><small>{group.memories.length}개의 추억</small></div><button type="button" onClick={onClose}>번들 접기</button></header>
    {group.note && <p className="bundle-spread-note">{group.note}</p>}
    <div className="bundle-memory-collage">{group.memories.map((memory, index) => { const asset = primaryAsset(memory); return <div key={memory.id} style={{ "--bundle-turn": `${(index % 5 - 2) * 0.28}deg` } as CSSProperties}><MemoryDetailCard memory={memory} url={asset ? memoryAssetUrl(asset.id) : undefined} onOpen={() => onOpenDetail(memory.id)} /></div>; })}</div>
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
  const [fitScale, setFitScale] = useState(0.6);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"attach" | "group" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [confirmDetach, setConfirmDetach] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const viewportElement = useRef<HTMLDivElement>(null);
  const shareCapture = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<BoardBottomSheetHandle>(null);
  const viewportRef = useRef(viewport);
  const saveTimer = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const itemDragOrigin = useRef<Map<string, BoardItem>>(new Map());
  const threadDragOrigin = useRef<{ thread: BoardThread; items: Map<string, BoardItem> } | null>(null);
  const pendingTransform = useRef<BoardItem | null>(null);
  const loadedOnce = useRef(false);

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
  useEffect(() => { const element = viewportElement.current; if (!element) return; const observer = new ResizeObserver(([entry]) => { const width = entry.contentRect.width; const height = entry.contentRect.height; setViewportSize({ width, height }); setFitScale(Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT) * 0.94); }); observer.observe(element); return () => observer.disconnect(); }, [payload?.board?.id]);
  useEffect(() => () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); }, []);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedItem = selectedItemIds.length === 1 ? itemMap.get(selectedItemIds[0]) ?? null : null;
  const selectedThread = selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) ?? null : null;
  const openGroup = openGroupId ? items.find((item) => item.groupId === openGroupId)?.group ?? null : null;
  const maxZ = Math.max(1, ...items.map((item) => item.zIndex));
  const existingMemoryIds = new Set(items.flatMap((item) => item.memoryId ? [item.memoryId] : []));
  const effectiveScale = fitScale * viewport.scale;

  function basePosition(scale = viewport.scale) { const actual = fitScale * scale; return { x: (viewportSize.width - BOARD_WIDTH * actual) / 2, y: (viewportSize.height - BOARD_HEIGHT * actual) / 2 }; }
  function clamp(next: BoardViewport): BoardViewport { const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next.scale)); const actual = fitScale * scale; const base = basePosition(scale); const minX = viewportSize.width - BOARD_WIDTH * actual - base.x; const maxX = -base.x; const minY = viewportSize.height - BOARD_HEIGHT * actual - base.y; const maxY = -base.y; return { x: BOARD_WIDTH * actual <= viewportSize.width ? 0 : Math.round(Math.min(maxX, Math.max(minX, next.x))), y: BOARD_HEIGHT * actual <= viewportSize.height ? 0 : Math.round(Math.min(maxY, Math.max(minY, next.y))), scale }; }
  function setView(next: BoardViewport) { const bounded = clamp(next); viewportRef.current = bounded; setViewport(bounded); }
  function saveViewport(next: BoardViewport) { if (!payload?.canEdit) return; if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); setSaveState("saving"); saveTimer.current = window.setTimeout(async () => { try { await apiFetch("/api/board", { method: "PATCH", body: JSON.stringify({ boardId, viewport: next }) }); setSaveState("saved"); } catch { setSaveState("error"); } }, 420); }
  function zoomAt(nextScale: number, clientX?: number, clientY?: number) { const target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale)); const element = viewportElement.current; const current = viewportRef.current; if (!element || clientX === undefined || clientY === undefined) { const next = clamp({ x: target <= 1 ? 0 : current.x, y: target <= 1 ? 0 : current.y, scale: target }); setView(next); saveViewport(next); return; } const rect = element.getBoundingClientRect(); const pointX = clientX - rect.left; const pointY = clientY - rect.top; const oldBase = basePosition(current.scale); const boardX = (pointX - oldBase.x - current.x) / (fitScale * current.scale); const boardY = (pointY - oldBase.y - current.y) / (fitScale * current.scale); const newBase = basePosition(target); const next = clamp({ x: pointX - newBase.x - boardX * fitScale * target, y: pointY - newBase.y - boardY * fitScale * target, scale: target }); setView(next); saveViewport(next); }
  function wheel(event: ReactWheelEvent<HTMLDivElement>) { if ((event.target as HTMLElement).closest(".board-bundle-spread")) return; event.preventDefault(); zoomAt(viewportRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY); }
  function pointerDistance(values: Array<{ x: number; y: number }>) { return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); }
  function startCanvas(event: ReactPointerEvent<HTMLDivElement>) { if ((event.target as HTMLElement).closest("[data-board-item],button,a,.rope,.board-bundle-spread")) return; event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const values = [...pointers.current.values()]; if (values.length === 1 && viewportRef.current.scale > 1) pan.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: viewportRef.current.x, originY: viewportRef.current.y }; if (values.length === 2) { pinch.current = { distance: pointerDistance(values), zoom: viewportRef.current.scale }; pan.current = null; } }
  function moveCanvas(event: ReactPointerEvent<HTMLDivElement>) { if (!pointers.current.has(event.pointerId)) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const values = [...pointers.current.values()]; if (values.length === 2 && pinch.current) zoomAt(pinch.current.zoom * pointerDistance(values) / Math.max(1, pinch.current.distance), (values[0].x + values[1].x) / 2, (values[0].y + values[1].y) / 2); else if (pan.current?.id === event.pointerId) setView({ ...viewportRef.current, x: pan.current.originX + event.clientX - pan.current.startX, y: pan.current.originY + event.clientY - pan.current.startY }); }
  function endCanvas(event: ReactPointerEvent<HTMLDivElement>) { pointers.current.delete(event.pointerId); if (!pointers.current.size) { pan.current = null; pinch.current = null; saveViewport(viewportRef.current); } }
  function clearSelection(event: ReactMouseEvent<HTMLDivElement>) { if ((event.target as HTMLElement).closest("[data-board-item],button,a,.rope,.board-bundle-spread")) return; setSelectedItemIds([]); setSelectedThreadId(null); sheetRef.current?.collapse(); }

  function updateLocal(next: BoardItem) { setItems((current) => current.map((item) => item.id === next.id ? next : item)); }
  function updateLocals(nextItems: BoardItem[]) { const nextMap = new Map(nextItems.map((item) => [item.id, item])); setItems((current) => current.map((item) => nextMap.get(item.id) ?? item)); }
  function itemPatch(next: BoardItem) { return { id: next.id, x: next.x, y: next.y, width: next.width, height: next.height, rotationTenths: next.rotationTenths, zIndex: next.zIndex, textContent: next.textContent ?? undefined, styleJson: next.styleJson }; }
  async function saveItems(nextItems: BoardItem[]) {
    const persisted = nextItems.filter((item) => !item.id.startsWith("upload-")); if (!persisted.length) return;
    setSaveState("saving");
    try {
      if (persisted.length === 1) { const { item } = await apiFetch<{ item: BoardItem }>("/api/board/items", { method: "PATCH", body: JSON.stringify(itemPatch(persisted[0])) }); updateLocal({ ...persisted[0], ...item }); }
      else { const { items: saved } = await apiFetch<{ items: BoardItem[] }>("/api/board/items", { method: "PATCH", body: JSON.stringify({ items: persisted.map(itemPatch) }) }); updateLocals(saved); }
      setSaveState("saved");
    } catch { setSaveState("error"); void load(); }
  }
  async function saveItem(next: BoardItem) { await saveItems([next]); }
  function chooseItem(id: string, event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) {
    const item = itemMap.get(id); if (!item) return;
    setSelectedThreadId(null); setPanelOpen(true); sheetRef.current?.openToMiddle();
    const additive = multiMode || "shiftKey" in event && event.shiftKey;
    if (additive) setSelectedItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    else setSelectedItemIds([id]);
  }
  function transformSelected(change: Partial<BoardItem>) { if (!selectedItem) return; const next = { ...selectedItem, ...change }; pendingTransform.current = null; updateLocal(next); void saveItem(next); }
  function previewSelected(change: Partial<BoardItem>) { if (!selectedItem) return; const next = { ...selectedItem, ...change }; pendingTransform.current = next; updateLocal(next); }
  function commitSelectedPreview() { const next = pendingTransform.current; if (!next) return; pendingTransform.current = null; void saveItem(next); }
  function hangingThreadForItem(id: string) { return threads.find((thread) => thread.mode === "hanging" && thread.itemIds.includes(id)) ?? null; }
  function beginItemDrag(item: BoardItem) {
    const ids = selectedItemIds.includes(item.id) ? selectedItemIds : [item.id];
    itemDragOrigin.current = new Map(ids.map((id) => itemMap.get(id)).filter((value): value is BoardItem => Boolean(value)).map((value) => [value.id, value]));
    const hanging = hangingThreadForItem(item.id);
    if (hanging) threadDragOrigin.current = { thread: hanging, items: new Map(hanging.itemIds.map((id) => itemMap.get(id)).filter((value): value is BoardItem => Boolean(value)).map((value) => [value.id, value])) };
  }
  function moveDraggedItems(item: BoardItem, dx: number, dy: number, done: boolean) {
    const hanging = hangingThreadForItem(item.id);
    if (hanging) { moveThread(hanging, "whole", dx, dy, done); return; }
    const origins = [...itemDragOrigin.current.values()]; if (!origins.length) return;
    const bounded = boundedGroupDelta(origins, dx, dy);
    const moved = origins.map((origin) => ({ ...origin, x: Math.round(origin.x + bounded.dx), y: Math.round(origin.y + bounded.dy) }));
    updateLocals(moved); if (done) { itemDragOrigin.current.clear(); void saveItems(moved); }
  }
  function resizeItem(item: BoardItem, width: number, height: number, done: boolean) { const next = { ...item, width, height }; updateLocal(next); if (done) void saveItem(next); }
  function rotateItem(item: BoardItem, rotationTenths: number, done: boolean) { const next = { ...item, rotationTenths }; updateLocal(next); if (done) void saveItem(next); }
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
    const linked = selectedItemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item && isThreadable(item)));
    if (linked.length < 2 || linked.length !== selectedItemIds.length) { setMessage("사진과 추억을 두 장 이상 골라주세요"); return; }
    let startX = linked[0].x + linked[0].width / 2; let startY = mode === "hanging" ? Math.max(70, Math.min(...linked.map((item) => item.y)) - 44) : linked[0].y + linked[0].height / 2;
    let endX = linked.at(-1)!.x + linked.at(-1)!.width / 2; let endY = mode === "hanging" ? startY : linked.at(-1)!.y + linked.at(-1)!.height / 2;
    if (Math.hypot(endX - startX, endY - startY) < 120) endX = Math.min(BOARD_WIDTH, startX + 420);
    try {
      const { thread } = await apiFetch<{ thread: BoardThread }>("/api/board/threads", { method: "POST", body: JSON.stringify({ boardId, mode, startX: Math.round(startX), startY: Math.round(startY), endX: Math.round(endX), endY: Math.round(endY), color: "warm-brown", itemIds: linked.map((item) => item.id) }) });
      setThreads((current) => [...current, thread]); setSelectedThreadId(thread.id); setSelectedItemIds([]);
      if (mode === "hanging") { const arranged = hangingLayout(thread, itemMap); updateLocals(arranged); await saveItems(arranged); }
      setMessage(mode === "hanging" ? "고른 추억을 실에 매달았어요" : "고른 추억을 실로 이었어요");
    } catch { setMessage("실을 걸지 못했어요"); }
  }
  type ThreadChange = Partial<Pick<BoardThread, "color" | "curve" | "itemIds" | "mode" | "startX" | "startY" | "endX" | "endY">>;
  function previewThread(thread: BoardThread) { setThreads((current) => current.map((value) => value.id === thread.id ? thread : value)); if (thread.mode === "hanging") updateLocals(hangingLayout(thread, itemMap)); }
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
    setThreads((current) => current.map((value) => value.id === next.id ? next : value));
    const arranged = hangingLayout(next, threadDragOrigin.current.items); updateLocals(arranged);
    if (done) { threadDragOrigin.current = null; void updateThread({ startX: next.startX, startY: next.startY, endX: next.endX, endY: next.endY }, next); }
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
  function openBundle(item: BoardItem) { if (!item.groupId) return; setOpenGroupId(item.groupId); window.history.replaceState(null, "", `/board/${boardId}?bundle=${item.groupId}`); }
  function closeBundle() { setOpenGroupId(null); window.history.replaceState(null, "", `/board/${boardId}`); }

  async function exportBoard() {
    const capture = shareCapture.current?.querySelector<HTMLElement>(".board-artwork");
    if (!payload?.board || !capture) return; setShareBusy(true);
    try {
      await document.fonts.ready;
      await Promise.all([...capture.querySelectorAll("img")].map((image) => image.complete ? image.decode().catch(() => undefined) : new Promise<void>((resolve) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => resolve(), { once: true }); })));
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(capture, {
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        scale: 2,
        backgroundColor: "#caa16d",
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("capture failed");
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const filename = `${payload.board.title.replace(/[\\/:*?"<>|]/g, "-")}-${date}.png`; const file = new File([blob], filename, { type: "image/png" });
      let shared = false;
      if (navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 820px)").matches && navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: payload.board.title }); shared = true; } catch { shared = false; }
      }
      if (!shared) { const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000); }
      setMessage("보드를 사진으로 남겼어요"); setShareOpen(false);
    } catch (error) { console.error("board_share_failed", error); setMessage("보드 사진을 만들지 못했어요 잠시 후 다시 시도해 주세요"); }
    finally { setShareBusy(false); }
  }

  if (!payload?.board) return <div className="board-detail-loading"><Link className="back-button" href="/board">← 보드 목록</Link>{message ? <InlineNotice tone="error">{message}</InlineNotice> : <p>보드를 펼치고 있어요…</p>}</div>;
  const transformBase = basePosition();
  const contextMode = selectedThread ? "thread" : selectedItemIds.length > 1 ? "multi" : selectedItem ? selectedItem.elementType === "note" || selectedItem.elementType === "label" ? "note" : "single" : "add";
  const selectedHangingThread = selectedItem ? hangingThreadForItem(selectedItem.id) : null;
  const toolboxTitle = contextMode === "add" ? "무엇을 붙일까요" : contextMode === "multi" ? `${selectedItemIds.length}장을 골랐어요` : contextMode === "thread" ? "실 다듬기" : `${selectedItem ? paperLabel(selectedItem) : "조각"} 다듬기`;
  return <div className={`memory-board-screen${editMode ? " is-editing" : " is-viewing"}`}>
    <header className="board-detail-header"><div><Link className="back-button" href="/board">← 보드 목록</Link><p className="paper-label">OUR CORK BOARD</p><h1>{payload.board.title}</h1>{payload.board.description && <p>{payload.board.description}</p>}<small>{payload.owner.displayName}의 보드 · {items.length}개의 조각</small></div><div className="board-detail-actions"><Button variant="quiet" onClick={() => setShareOpen(true)}>공유</Button>{payload.canEdit ? <Button aria-pressed={editMode} onClick={() => { const next = !editMode; setEditMode(next); setPanelOpen(next); setMultiMode(false); setSelectedItemIds([]); setSelectedThreadId(null); if (next) window.requestAnimationFrame(() => sheetRef.current?.openToMiddle()); }}>{editMode ? "꾸미기 마치기" : "꾸미기"}</Button> : <span className="board-readonly-label">구경하는 중</span>}</div></header>
    <div className="board-status-line"><span>{editMode ? "꾸미기 모드" : "보기 모드"}</span><small aria-live="polite">{message || (saveState === "saving" ? "저장 중…" : saveState === "saved" ? "보드를 저장했어요" : saveState === "error" ? "저장하지 못했어요" : "")}</small></div>
    <div className="board-workspace">
      <div ref={viewportElement} className="board-viewport-fixed" onPointerDown={startCanvas} onPointerMove={moveCanvas} onPointerUp={endCanvas} onPointerCancel={endCanvas} onPointerLeave={endCanvas} onClick={clearSelection} onWheel={wheel} onDoubleClick={(event) => zoomAt(viewport.scale < 1.5 ? 1.6 : 1, event.clientX, event.clientY)}>
        <div className="board-canvas-fixed" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `translate(${transformBase.x + viewport.x}px, ${transformBase.y + viewport.y}px) scale(${effectiveScale})` }}><BoardArtwork items={items} threads={threads} assetOverrides={assetOverrides} editMode={editMode} scale={effectiveScale} selectedItemIds={selectedItemIds} selectedThreadId={selectedThreadId} onItemSelect={chooseItem} onItemOpen={(item) => item.memoryId && openMemory(item.memoryId)} onBundleOpen={openBundle} onThreadSelect={(id) => { setSelectedThreadId(id); setSelectedItemIds([]); setPanelOpen(true); sheetRef.current?.openToMiddle(); }} onItemDragStart={beginItemDrag} onItemDrag={(item, dx, dy) => moveDraggedItems(item, dx, dy, false)} onItemDragEnd={(item, dx, dy) => moveDraggedItems(item, dx, dy, true)} onItemResize={resizeItem} onItemRotate={rotateItem} onThreadDrag={moveThread} onKeyboardMove={keyboardMove} /></div>
        {openGroup && <BundleSpread group={openGroup} onClose={closeBundle} onOpenDetail={openMemory} />}
        <div className="board-zoom-controls" aria-label="보드 확대"><button type="button" aria-label="축소" onClick={() => zoomAt(viewport.scale / 1.15)}>−</button><span>{Math.round(viewport.scale * 100)}%</span><button type="button" aria-label="확대" onClick={() => zoomAt(viewport.scale * 1.15)}>+</button><button type="button" onClick={() => { const next = { x: 0, y: 0, scale: 1 }; setView(next); saveViewport(next); }}>전체 보기</button></div>
      </div>
      {editMode && panelOpen && <BoardBottomSheet ref={sheetRef} className={`context-${contextMode}`} title={toolboxTitle}>
        <button type="button" className="multi-mode-toggle" aria-pressed={multiMode} onClick={() => { setMultiMode((current) => !current); setSelectedItemIds([]); }}><b aria-hidden="true">⌁</b><span>여러 장 선택</span></button>
        {contextMode === "add" && <div className="tool-paper-grid"><button type="button" onClick={() => setPicker("attach")}><b>▧</b><strong>추억 붙이기</strong></button><label className="tool-upload"><b>＋</b><strong>사진 붙이기</strong><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ""; }} /></label><button type="button" onClick={() => setNoteOpen(true)}><b>—</b><strong>메모지 붙이기</strong></button><button type="button" onClick={() => setPicker("group")}><b>▤</b><strong>추억 번들</strong></button>{uploadProgress !== null && <p className="tool-progress" aria-live="polite">사진을 붙이는 중 {uploadProgress}%</p>}</div>}
        {contextMode === "multi" && <div className="tool-section-stack"><ol className="selected-piece-list">{selectedItemIds.map((id, index) => <li key={id}><span>{index + 1}</span>{paperLabel(itemMap.get(id)!)}</li>)}</ol><div className="thread-mode-actions"><button type="button" onClick={() => void createThread("hanging")}><i aria-hidden="true">⌁</i><strong>실에 매달기</strong><span>빨래집게로 걸어요</span></button><button type="button" onClick={() => void createThread("linking")}><i aria-hidden="true">↝</i><strong>실로 연결하기</strong><span>지금 자리에서 이어요</span></button></div><button type="button" onClick={() => { setSelectedItemIds([]); setMultiMode(false); }}>여러 장 선택 마치기</button></div>}
        {(contextMode === "single" || contextMode === "note") && selectedItem && <div className="tool-section-stack"><div className="compact-adjuster"><span>크기</span><button aria-label="작게" onClick={() => transformSelected({ width: Math.max(80, selectedItem.width - 24), height: Math.max(60, Math.round(selectedItem.height * Math.max(80, selectedItem.width - 24) / selectedItem.width)) })}>−</button><input aria-label="크기" type="range" min="80" max="720" value={selectedItem.width} onChange={(event) => { const width = Number(event.target.value); previewSelected({ width, height: Math.min(620, Math.max(60, Math.round(selectedItem.height * width / selectedItem.width))) }); }} onPointerUp={commitSelectedPreview} onPointerCancel={commitSelectedPreview} onKeyUp={commitSelectedPreview} onBlur={commitSelectedPreview} /><button aria-label="크게" onClick={() => transformSelected({ width: Math.min(720, selectedItem.width + 24), height: Math.min(620, Math.round(selectedItem.height * Math.min(720, selectedItem.width + 24) / selectedItem.width)) })}>＋</button></div><div className="compact-adjuster"><span>기울기</span><button aria-label="왼쪽으로 기울이기" onClick={() => transformSelected({ rotationTenths: Math.max(-120, selectedItem.rotationTenths - 10) })}>↶</button><button onClick={() => transformSelected({ rotationTenths: 0 })}>바로 놓기</button><button aria-label="오른쪽으로 기울이기" onClick={() => transformSelected({ rotationTenths: Math.min(120, selectedItem.rotationTenths + 10) })}>↷</button></div><div className="paper-choice-row"><button onClick={() => transformSelected({ zIndex: maxZ + 1 })}>앞으로</button><button onClick={() => transformSelected({ zIndex: 1 })}>뒤로</button></div>{selectedHangingThread ? <button type="button" onClick={() => void removeThreadMember(selectedItem.id)}>실에서 분리하기</button> : <><span className="tool-field-label">붙이는 방법</span><div className="paper-choice-row">{[{ id: "pin", label: "압정" }, { id: "tape", label: "테이프" }, { id: "none", label: "그대로" }].map((option) => <button key={option.id} aria-pressed={selectedItem.styleJson.attachment === option.id} onClick={() => transformSelected({ styleJson: { ...selectedItem.styleJson, attachment: option.id } })}>{option.label}</button>)}</div></>}{contextMode === "note" && <><span className="tool-field-label">종이색</span><PaperSwatches value={selectedItem.styleJson.color ?? "cream"} onChange={(color) => transformSelected({ styleJson: { ...selectedItem.styleJson, color } })} /></>}<button type="button" className="danger paper-detach" onClick={() => setConfirmDetach(selectedItem.id)}>보드에서 떼기</button></div>}
        {contextMode === "thread" && selectedThread && <div className="tool-section-stack"><span className="thread-mode-label">{selectedThread.mode === "hanging" ? "실에 매단 추억" : "실로 이은 추억"}</span><span className="tool-field-label">실 색</span><div className="thread-swatch-list" role="radiogroup" aria-label="실 색">{THREAD_COLORS.map((color) => <button key={color.id} type="button" role="radio" aria-checked={selectedThread.color === color.id || color.id === "warm-brown" && ["beige", "brown", "yellow", "muted-red"].includes(selectedThread.color)} onClick={() => void updateThread({ color: color.id })} style={{ "--thread-color": color.value } as CSSProperties}><i aria-hidden="true" /><span>{color.label}</span>{(selectedThread.color === color.id || color.id === "warm-brown" && ["beige", "brown", "yellow", "muted-red"].includes(selectedThread.color)) && <b aria-hidden="true">✓</b>}</button>)}</div><span className="tool-field-label">실 처짐</span><div className="thread-curve-controls"><button onClick={() => void updateThread({ curve: Math.max(-160, selectedThread.curve - 16) })}>팽팽하게</button><input aria-label="실 처짐" type="range" min="-160" max="160" value={selectedThread.curve} onChange={(event) => previewThread({ ...selectedThread, curve: Number(event.target.value) })} onPointerUp={(event) => void updateThread({ curve: Number(event.currentTarget.value) }, { ...selectedThread, curve: Number(event.currentTarget.value) })} onKeyUp={(event) => void updateThread({ curve: Number(event.currentTarget.value) }, { ...selectedThread, curve: Number(event.currentTarget.value) })} /><button onClick={() => void updateThread({ curve: Math.min(160, selectedThread.curve + 16) })}>더 늘어지게</button></div><span className="tool-field-label">연결 순서</span><ThreadMemberOrder thread={selectedThread} itemMap={itemMap} onPreview={(ids) => previewThread({ ...selectedThread, itemIds: ids })} onCommit={(ids) => void updateThread({ itemIds: ids }, { ...selectedThread, itemIds: ids })} onDetach={(id) => void removeThreadMember(id)} /><button type="button" className="danger paper-detach" onClick={() => void deleteThread()}>실 연결 해제</button></div>}
      </BoardBottomSheet>}
    </div>
    {shareOpen && <div className="board-share-capture" aria-hidden="true" ref={shareCapture}><BoardArtwork items={items.filter((item) => !item.id.startsWith("upload-"))} threads={threads} assetOverrides={assetOverrides} eagerImages decorative /></div>}
    {picker && <MemoryPicker boardId={boardId} mode={picker} existingMemoryIds={existingMemoryIds} onClose={() => setPicker(null)} onDone={load} />}{noteOpen && <NoteDialog boardId={boardId} onClose={() => setNoteOpen(false)} onDone={load} />}{shareOpen && <ShareDialog busy={shareBusy} onClose={() => setShareOpen(false)} onShare={() => void exportBoard()} />}
    {confirmDetach && <PaperConfirmDialog title="이 조각을 보드에서 떼어낼까요" description="보관함의 원본 추억은 그대로 남아 있어요" cancelLabel="그대로 둘게요" confirmLabel="보드에서 떼기" busy={saveState === "saving"} onCancel={() => setConfirmDetach(null)} onConfirm={() => void detach()} />}
  </div>;
}
