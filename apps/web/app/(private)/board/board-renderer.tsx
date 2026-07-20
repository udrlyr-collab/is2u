"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { hangingPath, hangingPoint, itemCenter, linkingPaths } from "./board-geometry";
import { normalizeBoardPieceStyle } from "../../../lib/board-style";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  itemAssetUrl,
  paperLabel,
  primaryAsset,
  type BoardItem,
  type BoardMemory,
  type BoardThread,
  type BoardMode,
} from "./board-types";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

function BoardSurface() {
  const id = useId().replaceAll(":", "");
  const corkPattern = `cork-${id}`;
  const corkLight = `cork-light-${id}`;
  return <svg className="board-surface" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} width={BOARD_WIDTH} height={BOARD_HEIGHT} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={corkLight} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d7b47e" />
        <stop offset="0.48" stopColor="#cba36d" />
        <stop offset="1" stopColor="#b98b58" />
      </linearGradient>
      <pattern id={corkPattern} width="74" height="62" patternUnits="userSpaceOnUse">
        <rect width="74" height="62" fill={`url(#${corkLight})`} />
        <circle cx="10" cy="9" r="2.2" fill="#7c4d2f" opacity="0.28" />
        <circle cx="29" cy="23" r="2.8" fill="#f4dcae" opacity="0.34" />
        <circle cx="57" cy="13" r="1.6" fill="#7b4b2f" opacity="0.23" />
        <circle cx="66" cy="49" r="2.4" fill="#8b5634" opacity="0.2" />
        <circle cx="22" cy="52" r="1.8" fill="#f5deb0" opacity="0.26" />
        <path d="M2 35c13-5 24 4 38-1M39 47c9-4 18-2 30-8M20 15c8 2 15 1 25-3" fill="none" stroke="#7b4d31" strokeWidth="1.2" strokeLinecap="round" opacity="0.18" />
        <path d="M5 55c11-3 22-1 31 3M47 28c7 1 13 5 22 2" fill="none" stroke="#f7e4bd" strokeWidth="1.1" strokeLinecap="round" opacity="0.24" />
      </pattern>
    </defs>
    <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#8b5e3e" />
    <rect x="26" y="26" width={BOARD_WIDTH - 52} height={BOARD_HEIGHT - 52} fill={`url(#${corkPattern})`} />
    <rect x="30" y="30" width={BOARD_WIDTH - 60} height={BOARD_HEIGHT - 60} fill="none" stroke="#6f452d" strokeWidth="8" opacity="0.32" />
    <rect x="38" y="38" width={BOARD_WIDTH - 76} height={BOARD_HEIGHT - 76} fill="none" stroke="#f1d39f" strokeWidth="4" opacity="0.18" />
  </svg>;
}

function BoardFrameSurface() {
  const id = useId().replaceAll(":", "");
  const wood = `wood-${id}`;
  const grain = `grain-${id}`;
  return <svg className="board-frame-surface" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} width={BOARD_WIDTH} height={BOARD_HEIGHT} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a57951" />
        <stop offset="0.18" stopColor="#80583c" />
        <stop offset="0.52" stopColor="#65422e" />
        <stop offset="0.78" stopColor="#8c6243" />
        <stop offset="1" stopColor="#5d3b29" />
      </linearGradient>
      <pattern id={grain} width="92" height="28" patternUnits="userSpaceOnUse">
        <rect width="92" height="28" fill={`url(#${wood})`} />
        <path d="M0 7c18-5 31 7 52 0s27-2 40 2M-8 20c21-7 36 5 55-1s30 0 53-4" fill="none" stroke="#d5aa79" strokeWidth="1.8" opacity="0.22" />
        <path d="M7 13c11-2 19 2 30-1M55 24c9-4 22-4 34-1" fill="none" stroke="#3f271c" strokeWidth="1.4" opacity="0.25" />
      </pattern>
    </defs>
    <path d={`M0 0H${BOARD_WIDTH}L${BOARD_WIDTH - 34} 34H34Z`} fill={`url(#${grain})`} />
    <path d={`M0 ${BOARD_HEIGHT}H${BOARD_WIDTH}L${BOARD_WIDTH - 34} ${BOARD_HEIGHT - 34}H34Z`} fill={`url(#${grain})`} />
    <path d={`M0 0L34 34V${BOARD_HEIGHT - 34}L0 ${BOARD_HEIGHT}Z`} fill={`url(#${grain})`} />
    <path d={`M${BOARD_WIDTH} 0L${BOARD_WIDTH - 34} 34V${BOARD_HEIGHT - 34}L${BOARD_WIDTH} ${BOARD_HEIGHT}Z`} fill={`url(#${grain})`} />
    <rect x="2" y="2" width={BOARD_WIDTH - 4} height={BOARD_HEIGHT - 4} fill="none" stroke="#3f281c" strokeWidth="5" />
    <rect x="31" y="31" width={BOARD_WIDTH - 62} height={BOARD_HEIGHT - 62} fill="none" stroke="#4b3022" strokeWidth="6" opacity="0.7" />
    <rect x="37" y="37" width={BOARD_WIDTH - 74} height={BOARD_HEIGHT - 74} fill="none" stroke="#d5a97a" strokeWidth="3" opacity="0.42" />
  </svg>;
}

export function BoardNotePaper({ shape = "note", textStyle = "default", children }: { shape?: string; textStyle?: string; children: ReactNode }) {
  return <div className={`board-free-note shape-${shape} text-${textStyle}`}><p>{children}</p></div>;
}

export function MemoryVisual({ memory, url, detailed = false, eager = false }: { memory: BoardMemory; url?: string; detailed?: boolean; eager?: boolean }) {
  const asset = primaryAsset(memory);
  if (memory.type === "photo") {
    return (
      <figure className={`board-photo${detailed ? " detailed" : ""}`}>
        {url ? (
          <div className="board-image-container" style={{ width: "100%", height: "100%", position: "relative" }}>
            <div
              className="board-image-bg"
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: `url(${url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
            <img
              src={url}
              alt={memory.title}
              loading={detailed || eager ? "eager" : "lazy"}
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          <span>사진을 준비하고 있어요</span>
        )}
        <figcaption>{memory.title}</figcaption>
      </figure>
    );
  }
  if (memory.type === "video" || memory.type === "manual_video") {
    return (
      <figure className={`board-video${detailed ? " detailed" : ""}`}>
        {url ? (
          <div className="board-image-container" style={{ width: "100%", height: "100%", position: "relative" }}>
            <div
              className="board-image-bg"
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: `url(${url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
            <img
              src={url}
              alt={`${memory.title} 영상 포스터`}
              loading={detailed || eager ? "eager" : "lazy"}
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          <span>영상을 준비하고 있어요</span>
        )}
        <i aria-hidden="true">▶</i>
        <figcaption>{memory.title}</figcaption>
      </figure>
    );
  }
  if (memory.type === "audio") return <div className={`board-audio${detailed ? " detailed" : ""}`}><span className="board-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><strong>{memory.title}</strong>{detailed && url ? <audio controls preload="metadata" src={url}>오디오를 재생할 수 없어요</audio> : <small>{asset?.durationMs ? `${Math.ceil(asset.durationMs / 1000)}초` : "목소리 듣기"}</small>}</div>;
  if (memory.type === "emotion") return <div className={`board-emotion${detailed ? " detailed" : ""}`}><span aria-hidden="true">✦</span><strong>{memory.emotion || memory.title}</strong></div>;
  return <blockquote className={`board-note${detailed ? " detailed" : ""}`}><strong>{memory.title}</strong><p>{memory.text}</p><small>{memory.author.displayName}</small></blockquote>;
}

export function MemoryDetailCard({ memory, url, onOpen }: { memory: BoardMemory; url?: string; onOpen?: () => void }) {
  const details = <>
    <header><h3>{memory.title}</h3>{memory.dateEvent && <span className="date-sticker">{memory.dateEvent.title}</span>}</header>
    <dl><div><dt>처음 붙인 시간</dt><dd>{dateFormatter.format(new Date(memory.firstPinnedAt))}</dd></div><div><dt>남긴 사람</dt><dd>{memory.author.displayName}</dd></div></dl>
  </>;

  if (memory.type === "audio") {
    return <article className="board-bundle-memory-card memory-audio">
      <div className="bundle-memory-open">
        <MemoryVisual memory={memory} url={url} detailed />
        <button type="button" className="bundle-memory-details" onClick={onOpen} aria-label={`${memory.title} 자세히 보기`}>{details}</button>
      </div>
    </article>;
  }

  return <article className={`board-bundle-memory-card memory-${memory.type}`}>
    <button type="button" className="bundle-memory-open" onClick={onOpen} aria-label={`${memory.title} 자세히 보기`}>
      <MemoryVisual memory={memory} url={url} detailed />
      {details}
    </button>
  </article>;
}

type PieceProps = {
  item: BoardItem;
  url?: string;
  mode?: BoardMode;
  selected?: boolean;
  multiSelected?: boolean;
  clipped?: boolean;
  scale?: number;
  onSelect?: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onOpen?: () => void;
  onOpenBundle?: () => void;
  onResize?: (item: BoardItem, width: number, height: number, done: boolean) => void;
  onRotate?: (item: BoardItem, rotationTenths: number, done: boolean) => void;
  onKeyboardMove?: (item: BoardItem, dx: number, dy: number) => void;
  eagerImages?: boolean;
  decorative?: boolean;
};

function BoardPiece({ item, url, mode = "view", selected = false, multiSelected = false, clipped = false, scale = 1, onSelect, onOpen, onOpenBundle, onResize, onRotate, onKeyboardMove, eagerImages = false, decorative = false }: PieceProps) {
  const resize = useRef<{ pointerId: number; startX: number; width: number; height: number } | null>(null);
  const rotate = useRef<{ pointerId: number; centerX: number; centerY: number } | null>(null);

  const editMode = mode === "edit";
  const isDecorative = mode === "thumbnail" || mode === "export" || decorative;
  const eager = mode === "export" || mode === "edit" || mode === "thumbnail" || eagerImages;

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
  const style = normalizeBoardPieceStyle(item.styleJson, item.elementType);
  const effectiveAttachment = clipped ? "clip" : style.attachment ?? "pin";
  const actionable = !isDecorative && (editMode || item.elementType === "bundle" || Boolean(item.memoryId));
  return <div data-board-item="true" data-item-id={item.id} className={`board-piece piece-${item.elementType} color-${style.color ?? "cream"} attach-${effectiveAttachment} shadow-${style.shadow ?? "soft"}${selected ? " selected" : ""}${multiSelected ? " multi-selected" : ""}${editMode ? " editable" : ""}${clipped ? " is-clipped" : ""}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zIndex, transform: `rotate(${item.rotationTenths / 10}deg)` }} tabIndex={actionable ? 0 : -1} role={actionable ? "button" : undefined} aria-label={actionable ? editMode ? `${paperLabel(item)} 선택됨 ${selected || multiSelected ? "예" : "아니오"}` : item.elementType === "bundle" ? `${paperLabel(item)} 열기` : `${paperLabel(item)} 자세히 보기` : undefined} onDragStart={(event) => event.preventDefault()} onKeyDown={keyDown}>
    {clipped ? <span className="board-clothespin" aria-hidden="true"><i /></span> : effectiveAttachment === "tape" ? <span className="board-piece-tape" aria-hidden="true" /> : effectiveAttachment === "pin" ? <span className="board-pin" aria-hidden="true" /> : null}
    {multiSelected && <span className="board-selection-tape" aria-hidden="true">✓</span>}
    <div className="board-piece-surface">
      {item.elementType === "image" && (url ? <div className="board-image-container" style={{ width: "100%", height: "100%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}><span className="board-object-ground" aria-hidden="true" /><div className="board-image-bg" style={{ width: "100%", height: "100%", backgroundImage: `url(${url})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} /><img className="board-free-image" src={url} alt={item.asset?.originalFilename ?? "보드 사진"} loading={eager ? "eager" : "lazy"} draggable={false} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} /></div> : <span className="board-image-loading">사진을 펼치고 있어요</span>)}
      {(item.elementType === "note" || item.elementType === "label") && <BoardNotePaper shape={style.shape} textStyle={style.textStyle}>{item.textContent}</BoardNotePaper>}
      {item.elementType === "sticker" && <div className={`board-free-sticker sticker-${style.sticker ?? "sparkle"}`} aria-hidden="true">{style.sticker === "heart" ? "♡" : style.sticker === "star" ? "☆" : style.sticker === "flower" ? "✿" : style.sticker === "arrow" ? "↝" : style.sticker === "tape" ? "▱" : "✦"}</div>}
      {item.elementType === "bundle" && item.group && <div className={`board-group-stack group-${item.group.style}`}><i aria-hidden="true" /><i aria-hidden="true" />{memory && <MemoryVisual memory={memory} url={url} eager={eager} />}<div className="board-group-label"><strong>{item.group.name}</strong><small>{item.group.count}개의 추억</small></div></div>}
      {item.elementType === "memory" && item.memory && <MemoryVisual memory={item.memory} url={url} eager={eager} />}
    </div>
    {(selected || multiSelected) && <span className="board-selection-outline" aria-hidden="true" />}
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
  mode?: BoardMode;
  scale?: number;
  selectedItemIds?: string[];
  selectedThreadId?: string | null;
  onItemSelect?: (id: string, event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onItemOpen?: (item: BoardItem) => void;
  onBundleOpen?: (item: BoardItem) => void;
  onThreadSelect?: (id: string) => void;
  onItemResize?: (item: BoardItem, width: number, height: number, done: boolean) => void;
  onItemRotate?: (item: BoardItem, rotationTenths: number, done: boolean) => void;
  onThreadDrag?: (thread: BoardThread, part: ThreadDragPart, dx: number, dy: number, done: boolean) => void;
  onKeyboardMove?: (item: BoardItem, dx: number, dy: number) => void;
  eagerImages?: boolean;
};

export function BoardArtwork({ items, threads, className = "", assetOverrides = {}, mode = "view", scale = 1, selectedItemIds = [], selectedThreadId, onItemSelect, onItemOpen, onBundleOpen, onThreadSelect, onItemResize, onItemRotate, onThreadDrag, onKeyboardMove, eagerImages = false }: ArtworkProps) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const clippedIds = new Set(threads.filter((thread) => thread.mode === "hanging").flatMap((thread) => thread.itemIds));
  const isEdit = mode === "edit";
  const isDecorative = mode === "thumbnail" || mode === "export";
  const eager = mode === "export" || mode === "edit" || eagerImages;

  return <div className={`board-artwork ${className}`} style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
    <BoardSurface />
    <svg className="board-thread-layer" width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-label="추억을 잇는 실">{threads.map((thread) => {
      const paths = thread.mode === "linking" ? linkingPaths(thread, itemMap) : [hangingPath(thread)];
      return <g key={thread.id} data-thread-id={thread.id} className={`rope rope-${thread.color} mode-${thread.mode}${selectedThreadId === thread.id ? " selected" : ""}`} onPointerDown={(event) => { if (!isEdit) return; event.preventDefault(); event.stopPropagation(); onThreadSelect?.(thread.id); }}>{paths.map((path, index) => <g key={index}><path className="rope-shadow" data-segment-index={index} d={path} /><path className="rope-cord" data-segment-index={index} d={path} /></g>)}{thread.mode === "hanging" && <><circle cx={thread.startX} cy={thread.startY} r="9" /><circle cx={thread.endX} cy={thread.endY} r="9" /></>}</g>;
    })}</svg>
    {isEdit && threads.map((thread, index) => {
      const members = thread.itemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
      const middle = thread.mode === "hanging" ? hangingPoint(thread, 0.5) : members.length ? itemCenter(members[Math.floor((members.length - 1) / 2)]) : { x: thread.startX, y: thread.startY };
      if (selectedThreadId !== thread.id) return <button key={thread.id} type="button" className="rope-edit-handle" aria-label={`실 ${index + 1} 꾸미기`} style={{ left: middle.x, top: middle.y, "--board-handle-inverse-scale": 1 / Math.max(scale, 0.01) } as CSSProperties} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); onThreadSelect?.(thread.id); }} />;
      return <div key={thread.id} className="rope-selected-controls"><ThreadDragHandle thread={thread} part="whole" x={middle.x} y={middle.y} scale={scale} onDrag={thread.mode === "hanging" ? onThreadDrag : undefined} />{thread.mode === "hanging" && <><ThreadDragHandle thread={thread} part="start" x={thread.startX} y={thread.startY} scale={scale} onDrag={onThreadDrag} /><ThreadDragHandle thread={thread} part="end" x={thread.endX} y={thread.endY} scale={scale} onDrag={onThreadDrag} /></>}</div>;
    })}
    {items.map((item) => <BoardPiece key={item.id} item={item} url={itemAssetUrl(item, assetOverrides)} mode={mode} selected={selectedItemIds.length === 1 && selectedItemIds[0] === item.id} multiSelected={selectedItemIds.length > 1 && selectedItemIds.includes(item.id)} clipped={clippedIds.has(item.id)} scale={scale} onSelect={(event) => onItemSelect?.(item.id, event)} onOpen={() => onItemOpen?.(item)} onOpenBundle={() => onBundleOpen?.(item)} onResize={onItemResize} onRotate={onItemRotate} onKeyboardMove={onKeyboardMove} eagerImages={eager} decorative={isDecorative} />)}
    <BoardFrameSurface />
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
  return <div ref={host} className="board-readonly-preview"><div style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `scale(${scale})` }}><BoardArtwork items={items} threads={threads} mode="thumbnail" /></div></div>;
}
