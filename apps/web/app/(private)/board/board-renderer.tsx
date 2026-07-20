"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { hangingPath, hangingPoint, itemCenter, linkingPaths } from "./board-geometry";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  itemAssetUrl,
  paperLabel,
  primaryAsset,
  type BoardItem,
  type BoardMemory,
  type BoardThread,
} from "./board-types";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

export function MemoryVisual({ memory, url, detailed = false, eager = false }: { memory: BoardMemory; url?: string; detailed?: boolean; eager?: boolean }) {
  const asset = primaryAsset(memory);
  if (memory.type === "photo") return <figure className={`board-photo${detailed ? " detailed" : ""}`}>{url ? <img src={url} alt={memory.title} loading={detailed || eager ? "eager" : "lazy"} draggable={false} /> : <span>사진을 준비하고 있어요</span>}<figcaption>{memory.title}</figcaption></figure>;
  if (memory.type === "video" || memory.type === "manual_video") return <figure className={`board-video${detailed ? " detailed" : ""}`}>{url ? <img src={url} alt={`${memory.title} 영상 포스터`} loading={detailed || eager ? "eager" : "lazy"} draggable={false} /> : <span>영상을 준비하고 있어요</span>}<i aria-hidden="true">▶</i><figcaption>{memory.title}</figcaption></figure>;
  if (memory.type === "audio") return <div className={`board-audio${detailed ? " detailed" : ""}`}><span className="board-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><strong>{memory.title}</strong>{detailed && url ? <audio controls preload="metadata" src={url}>오디오를 재생할 수 없어요</audio> : <small>{asset?.durationMs ? `${Math.ceil(asset.durationMs / 1000)}초` : "목소리 듣기"}</small>}</div>;
  if (memory.type === "emotion") return <div className={`board-emotion${detailed ? " detailed" : ""}`}><span aria-hidden="true">✦</span><strong>{memory.emotion || memory.title}</strong></div>;
  return <blockquote className={`board-note${detailed ? " detailed" : ""}`}><strong>{memory.title}</strong><p>{memory.text}</p><small>{memory.author.displayName}</small></blockquote>;
}

export function MemoryDetailCard({ memory, url, onOpen }: { memory: BoardMemory; url?: string; onOpen?: () => void }) {
  return <article className={`board-bundle-memory-card memory-${memory.type}`}>
    <button type="button" className="bundle-memory-open" onClick={onOpen} aria-label={`${memory.title} 자세히 보기`}>
      <MemoryVisual memory={memory} url={url} detailed />
      <header><h3>{memory.title}</h3>{memory.dateEvent && <span className="date-sticker">{memory.dateEvent.title}</span>}</header>
      <dl><div><dt>처음 붙인 시간</dt><dd>{dateFormatter.format(new Date(memory.firstPinnedAt))}</dd></div><div><dt>남긴 사람</dt><dd>{memory.author.displayName}</dd></div></dl>
    </button>
  </article>;
}

type PieceProps = {
  item: BoardItem;
  url?: string;
  editMode?: boolean;
  selected?: boolean;
  multiSelected?: boolean;
  clipped?: boolean;
  scale?: number;
  onSelect?: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onOpen?: () => void;
  onOpenBundle?: () => void;
  onDragStart?: (item: BoardItem) => void;
  onDrag?: (item: BoardItem, dx: number, dy: number) => void;
  onDragEnd?: (item: BoardItem, dx: number, dy: number) => void;
  onResize?: (item: BoardItem, width: number, height: number, done: boolean) => void;
  onRotate?: (item: BoardItem, rotationTenths: number, done: boolean) => void;
  onKeyboardMove?: (item: BoardItem, dx: number, dy: number) => void;
  eagerImages?: boolean;
  decorative?: boolean;
};

function BoardPiece({ item, url, editMode = false, selected = false, multiSelected = false, clipped = false, scale = 1, onSelect, onOpen, onOpenBundle, onDragStart, onDrag, onDragEnd, onResize, onRotate, onKeyboardMove, eagerImages = false, decorative = false }: PieceProps) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const resize = useRef<{ pointerId: number; startX: number; width: number; height: number } | null>(null);
  const rotate = useRef<{ pointerId: number; centerX: number; centerY: number } | null>(null);

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editMode || (event.target as HTMLElement).closest("[data-piece-handle]")) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); if (!selected && !multiSelected) onSelect?.(event); onDragStart?.(item);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 3) drag.current.moved = true;
    onDrag?.(item, (event.clientX - drag.current.startX) / Math.max(scale, 0.01), (event.clientY - drag.current.startY) / Math.max(scale, 0.01));
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const { startX, startY, moved } = drag.current; drag.current = null;
    if (!moved && (selected || multiSelected)) onSelect?.(event);
    onDragEnd?.(item, (event.clientX - startX) / Math.max(scale, 0.01), (event.clientY - startY) / Math.max(scale, 0.01));
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editMode && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); const amount = event.shiftKey ? 10 : 1;
      onKeyboardMove?.(item, event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0); return;
    }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (editMode) onSelect?.(event as never); else if (item.elementType === "bundle") onOpenBundle?.(); else onOpen?.(); }
  }
  function resizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { pointerId: event.pointerId, startX: event.clientX, width: item.width, height: item.height };
  }
  function resizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = resize.current; if (!current || current.pointerId !== event.pointerId) return;
    const width = Math.min(720, Math.max(80, Math.round(current.width + (event.clientX - current.startX) / Math.max(scale, 0.01))));
    onResize?.(item, width, Math.min(620, Math.max(60, Math.round(current.height * width / current.width))), false);
  }
  function resizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = resize.current; if (!current || current.pointerId !== event.pointerId) return; resize.current = null;
    const width = Math.min(720, Math.max(80, Math.round(current.width + (event.clientX - current.startX) / Math.max(scale, 0.01))));
    onResize?.(item, width, Math.min(620, Math.max(60, Math.round(current.height * width / current.width))), true);
  }
  function rotateStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.parentElement!.getBoundingClientRect(); rotate.current = { pointerId: event.pointerId, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
  }
  function rotateMove(event: ReactPointerEvent<HTMLButtonElement>, done: boolean) {
    const current = rotate.current; if (!current || current.pointerId !== event.pointerId) return;
    const degrees = Math.atan2(event.clientY - current.centerY, event.clientX - current.centerX) * 180 / Math.PI + 90;
    onRotate?.(item, Math.round(Math.min(120, Math.max(-120, degrees * 10))), done);
    if (done) rotate.current = null;
  }

  const memory = item.memory ?? item.group?.representative ?? null;
  const style = item.styleJson ?? {};
  const effectiveAttachment = clipped ? "clip" : style.attachment ?? "pin";
  const actionable = !decorative && (editMode || item.elementType === "bundle" || Boolean(item.memoryId));
  return <div data-board-item="true" data-item-id={item.id} className={`board-piece piece-${item.elementType} color-${style.color ?? "cream"} attach-${effectiveAttachment} shadow-${style.shadow ?? "soft"}${selected ? " selected" : ""}${multiSelected ? " multi-selected" : ""}${editMode ? " editable" : ""}${clipped ? " is-clipped" : ""}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zIndex, transform: `rotate(${item.rotationTenths / 10}deg)` }} tabIndex={actionable ? 0 : -1} role={actionable ? "button" : undefined} aria-label={actionable ? editMode ? `${paperLabel(item)} 선택됨 ${selected || multiSelected ? "예" : "아니오"}` : item.elementType === "bundle" ? `${paperLabel(item)} 열기` : `${paperLabel(item)} 자세히 보기` : undefined} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={(event) => { event.stopPropagation(); if (!editMode && item.elementType === "bundle") onOpenBundle?.(); else if (!editMode) onOpen?.(); }} onKeyDown={keyDown}>
    {clipped ? <span className="board-clothespin" aria-hidden="true"><i /></span> : effectiveAttachment === "tape" ? <span className="board-piece-tape" aria-hidden="true" /> : effectiveAttachment === "pin" ? <span className="board-pin" aria-hidden="true" /> : null}
    {multiSelected && <span className="board-selection-tape" aria-hidden="true">✓</span>}
    {item.elementType === "image" && (url ? <img className="board-free-image" src={url} alt={item.asset?.originalFilename ?? "보드 사진"} loading={eagerImages ? "eager" : "lazy"} draggable={false} /> : <span className="board-image-loading">사진을 펼치고 있어요</span>)}
    {(item.elementType === "note" || item.elementType === "label") && <div className={`board-free-note shape-${style.shape ?? "note"}`}><p>{item.textContent}</p></div>}
    {item.elementType === "sticker" && <div className={`board-free-sticker sticker-${style.sticker ?? "sparkle"}`} aria-hidden="true">{style.sticker === "heart" ? "♡" : style.sticker === "star" ? "☆" : style.sticker === "flower" ? "✿" : style.sticker === "arrow" ? "↝" : style.sticker === "tape" ? "▱" : "✦"}</div>}
    {item.elementType === "bundle" && item.group && <div className={`board-group-stack group-${item.group.style}`}><i aria-hidden="true" /><i aria-hidden="true" />{memory && <MemoryVisual memory={memory} url={url} eager={eagerImages} />}<div className="board-group-label"><strong>{item.group.name}</strong><small>{item.group.count}개의 추억</small></div></div>}
    {item.elementType === "memory" && item.memory && <MemoryVisual memory={item.memory} url={url} eager={eagerImages} />}
    {editMode && selected && <>
      <button type="button" data-piece-handle className="piece-rotate-handle" aria-label="회전 손잡이" style={{ "--board-handle-inverse-scale": 1 / Math.max(scale, 0.01) } as CSSProperties} onPointerDown={rotateStart} onPointerMove={(event) => rotateMove(event, false)} onPointerUp={(event) => rotateMove(event, true)} onPointerCancel={(event) => rotateMove(event, true)} />
      <button type="button" data-piece-handle className="piece-resize-handle" aria-label="크기 조절 손잡이" style={{ "--board-handle-inverse-scale": 1 / Math.max(scale, 0.01) } as CSSProperties} onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} />
    </>}
  </div>;
}

type ThreadDragPart = "start" | "end" | "whole";
function ThreadDragHandle({ thread, part, x, y, scale, onDrag }: { thread: BoardThread; part: ThreadDragPart; x: number; y: number; scale: number; onDrag?: (thread: BoardThread, part: ThreadDragPart, dx: number, dy: number, done: boolean) => void }) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  return <button type="button" className={`rope-direct-handle rope-handle-${part}`} aria-label={part === "start" ? "실 왼쪽 끝 옮기기" : part === "end" ? "실 오른쪽 끝 옮기기" : "실 전체 옮기기"} style={{ left: x, top: y, "--board-handle-inverse-scale": 1 / Math.max(scale, 0.01) } as CSSProperties} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (pointer.current?.id !== event.pointerId) return; onDrag?.(thread, part, (event.clientX - pointer.current.x) / Math.max(scale, 0.01), (event.clientY - pointer.current.y) / Math.max(scale, 0.01), false); }} onPointerUp={(event) => { if (pointer.current?.id !== event.pointerId) return; const current = pointer.current; pointer.current = null; onDrag?.(thread, part, (event.clientX - current.x) / Math.max(scale, 0.01), (event.clientY - current.y) / Math.max(scale, 0.01), true); }} onPointerCancel={(event) => { if (pointer.current?.id !== event.pointerId) return; const current = pointer.current; pointer.current = null; onDrag?.(thread, part, (event.clientX - current.x) / Math.max(scale, 0.01), (event.clientY - current.y) / Math.max(scale, 0.01), true); }} />;
}

type ArtworkProps = {
  items: BoardItem[];
  threads: BoardThread[];
  className?: string;
  assetOverrides?: Record<string, string>;
  editMode?: boolean;
  scale?: number;
  selectedItemIds?: string[];
  selectedThreadId?: string | null;
  onItemSelect?: (id: string, event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onItemOpen?: (item: BoardItem) => void;
  onBundleOpen?: (item: BoardItem) => void;
  onThreadSelect?: (id: string) => void;
  onItemDragStart?: (item: BoardItem) => void;
  onItemDrag?: (item: BoardItem, dx: number, dy: number) => void;
  onItemDragEnd?: (item: BoardItem, dx: number, dy: number) => void;
  onItemResize?: (item: BoardItem, width: number, height: number, done: boolean) => void;
  onItemRotate?: (item: BoardItem, rotationTenths: number, done: boolean) => void;
  onThreadDrag?: (thread: BoardThread, part: ThreadDragPart, dx: number, dy: number, done: boolean) => void;
  onKeyboardMove?: (item: BoardItem, dx: number, dy: number) => void;
  eagerImages?: boolean;
  decorative?: boolean;
};

export function BoardArtwork({ items, threads, className = "", assetOverrides = {}, editMode = false, scale = 1, selectedItemIds = [], selectedThreadId, onItemSelect, onItemOpen, onBundleOpen, onThreadSelect, onItemDragStart, onItemDrag, onItemDragEnd, onItemResize, onItemRotate, onThreadDrag, onKeyboardMove, eagerImages = false, decorative = false }: ArtworkProps) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const clippedIds = new Set(threads.filter((thread) => thread.mode === "hanging").flatMap((thread) => thread.itemIds));
  return <div className={`board-artwork ${className}`} style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
    <span className="board-wood-frame" aria-hidden="true" />
    <svg className="board-thread-layer" width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label="추억을 잇는 실">{threads.map((thread) => {
      const paths = thread.mode === "linking" ? linkingPaths(thread, itemMap) : [hangingPath(thread)];
      return <g key={thread.id} className={`rope rope-${thread.color} mode-${thread.mode}${selectedThreadId === thread.id ? " selected" : ""}`} onPointerDown={(event) => { if (!editMode) return; event.preventDefault(); event.stopPropagation(); onThreadSelect?.(thread.id); }}>{paths.map((path, index) => <g key={index}><path className="rope-shadow" d={path} /><path className="rope-cord" d={path} /></g>)}{thread.mode === "hanging" && <><circle cx={thread.startX} cy={thread.startY} r="9" /><circle cx={thread.endX} cy={thread.endY} r="9" /></>}</g>;
    })}</svg>
    {editMode && threads.map((thread, index) => {
      const members = thread.itemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
      const middle = thread.mode === "hanging" ? hangingPoint(thread, 0.5) : members.length ? itemCenter(members[Math.floor((members.length - 1) / 2)]) : { x: thread.startX, y: thread.startY };
      if (selectedThreadId !== thread.id) return <button key={thread.id} type="button" className="rope-edit-handle" aria-label={`실 ${index + 1} 꾸미기`} style={{ left: middle.x, top: middle.y, "--board-handle-inverse-scale": 1 / Math.max(scale, 0.01) } as CSSProperties} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); onThreadSelect?.(thread.id); }} />;
      return <div key={thread.id} className="rope-selected-controls"><ThreadDragHandle thread={thread} part="whole" x={middle.x} y={middle.y} scale={scale} onDrag={thread.mode === "hanging" ? onThreadDrag : undefined} />{thread.mode === "hanging" && <><ThreadDragHandle thread={thread} part="start" x={thread.startX} y={thread.startY} scale={scale} onDrag={onThreadDrag} /><ThreadDragHandle thread={thread} part="end" x={thread.endX} y={thread.endY} scale={scale} onDrag={onThreadDrag} /></>}</div>;
    })}
    {items.map((item) => <BoardPiece key={item.id} item={item} url={itemAssetUrl(item, assetOverrides)} editMode={editMode} selected={selectedItemIds.length === 1 && selectedItemIds[0] === item.id} multiSelected={selectedItemIds.length > 1 && selectedItemIds.includes(item.id)} clipped={clippedIds.has(item.id)} scale={scale} onSelect={(event) => onItemSelect?.(item.id, event)} onOpen={() => onItemOpen?.(item)} onOpenBundle={() => onBundleOpen?.(item)} onDragStart={onItemDragStart} onDrag={onItemDrag} onDragEnd={onItemDragEnd} onResize={onItemResize} onRotate={onItemRotate} onKeyboardMove={onKeyboardMove} eagerImages={eagerImages} decorative={decorative} />)}
  </div>;
}

export function ReadOnlyBoardPreview({ items, threads }: { items: BoardItem[]; threads: BoardThread[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  useEffect(() => {
    const element = host.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / BOARD_WIDTH, entry.contentRect.height / BOARD_HEIGHT)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  return <div ref={host} className="board-readonly-preview"><div style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `scale(${scale})` }}><BoardArtwork items={items} threads={threads} decorative /></div></div>;
}
