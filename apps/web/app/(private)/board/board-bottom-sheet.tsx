"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type SheetStage = "collapsed" | "middle" | "expanded";
export type BoardBottomSheetHandle = {
  openToMiddle: () => void;
  collapse: () => void;
  stage: () => SheetStage;
};

const STAGE_LABEL: Record<SheetStage, string> = { collapsed: "접힘", middle: "중간", expanded: "펼침" };
const STAGES: SheetStage[] = ["collapsed", "middle", "expanded"];
const MOBILE_SHEET_QUERY = "(max-width: 739px), (max-height: 500px) and (pointer: coarse)";

function stageHeights(viewportHeight: number) {
  const available = Math.max(220, viewportHeight - 88);
  return {
    collapsed: 96,
    middle: Math.round(Math.max(148, Math.min(available * 0.42, 390))),
    expanded: Math.round(Math.min(available * 0.88, available - 12)),
  };
}

export const BoardBottomSheet = forwardRef<BoardBottomSheetHandle, {
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  onCollapsed?: () => void;
}>(function BoardBottomSheet({ title, children, headerAction, className = "", onCollapsed }, forwardedRef) {
  const rootRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<SheetStage>("middle");
  const [stage, setStageState] = useState<SheetStage>("middle");
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const drag = useRef<{ pointerId: number; startY: number; startVisible: number; lastY: number; lastAt: number; velocity: number; moved: boolean; fromContent: boolean; directionLocked: boolean } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingDragPosition = useRef<{ expanded: number; visible: number } | null>(null);

  const measurements = useCallback(() => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    return stageHeights(height);
  }, []);

  const cancelDragFrame = useCallback(() => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDragPosition.current = null;
  }, []);

  const queueDragPosition = useCallback((expanded: number, visible: number) => {
    pendingDragPosition.current = { expanded, visible };
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const pending = pendingDragPosition.current;
      pendingDragPosition.current = null;
      const element = rootRef.current;
      if (!pending || !element) return;
      element.style.setProperty("--sheet-expanded-height", `${pending.expanded}px`);
      element.style.setProperty("--sheet-translate", `${pending.expanded - pending.visible}px`);
    });
  }, []);

  const applyStage = useCallback((next: SheetStage, announce = true) => {
    cancelDragFrame();
    stageRef.current = next;
    setStageState(next);
    const element = rootRef.current;
    if (element && window.matchMedia(MOBILE_SHEET_QUERY).matches) {
      const heights = measurements();
      element.style.setProperty("--sheet-expanded-height", `${heights.expanded}px`);
      element.style.setProperty("--sheet-translate", `${heights.expanded - heights[next]}px`);
      element.dataset.sheetDragging = "false";
    }
    if (next === "collapsed") {
      if (contentRef.current?.contains(document.activeElement)) rootRef.current?.focus({ preventScroll: true });
      onCollapsed?.();
    }
    if (announce) window.requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
  }, [cancelDragFrame, measurements, onCollapsed]);

  useImperativeHandle(forwardedRef, () => ({
    openToMiddle: () => { if (stageRef.current === "collapsed") applyStage("middle", false); },
    collapse: () => applyStage("collapsed", false),
    stage: () => stageRef.current,
  }), [applyStage]);

  useLayoutEffect(() => {
    const query = window.matchMedia(MOBILE_SHEET_QUERY);
    const sync = () => {
      setMobile(query.matches);
      if (query.matches) applyStage(stageRef.current, false);
      setReady(true);
    };
    sync(); query.addEventListener("change", sync);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      cancelDragFrame();
      query.removeEventListener("change", sync);
      viewport?.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [applyStage, cancelDragFrame]);

  function begin(event: ReactPointerEvent<HTMLElement>, fromContent = false) {
    if (!mobile || event.button !== 0) return;
    if (fromContent) {
      const target = event.target as HTMLElement;
      if (contentRef.current?.scrollTop !== 0 || target.closest("button,input,textarea,select,label,a,[data-no-sheet-drag]")) return;
    }
    const heights = measurements();
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startVisible: heights[stageRef.current], lastY: event.clientY, lastAt: performance.now(), velocity: 0, moved: false, fromContent, directionLocked: !fromContent };
    if (!fromContent) {
      event.currentTarget.setPointerCapture(event.pointerId);
      rootRef.current?.setAttribute("data-sheet-dragging", "true");
    }
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !rootRef.current) return;
    const delta = event.clientY - current.startY;
    if (current.fromContent && !current.directionLocked) {
      if (Math.abs(delta) <= 6) return;
      if (delta < 0) {
        drag.current = null;
        return;
      }
      current.directionLocked = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      rootRef.current.setAttribute("data-sheet-dragging", "true");
    }
    if (Math.abs(delta) > 3) current.moved = true;
    if (!current.moved) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastAt);
    current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY; current.lastAt = now;
    const heights = measurements();
    const visible = Math.min(heights.expanded, Math.max(heights.collapsed, current.startVisible - delta));
    queueDragPosition(heights.expanded, visible);
  }

  function end(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.fromContent && !current.directionLocked) return;
    if (!current.moved) {
      const currentIndex = STAGES.indexOf(stageRef.current);
      applyStage(stageRef.current === "expanded" ? "middle" : STAGES[Math.min(2, currentIndex + 1)], false);
      return;
    }
    const heights = measurements();
    const delta = event.clientY - current.startY;
    const visible = Math.min(heights.expanded, Math.max(heights.collapsed, current.startVisible - delta));
    let targetIndex = STAGES.indexOf(stageRef.current);
    if (Math.abs(current.velocity) > 0.48) targetIndex += current.velocity < 0 ? 1 : -1;
    else targetIndex = STAGES.reduce((best, candidate, index) => Math.abs(heights[candidate] - visible) < Math.abs(heights[STAGES[best]] - visible) ? index : best, 0);
    applyStage(STAGES[Math.max(0, Math.min(STAGES.length - 1, targetIndex))], false);
  }

  function cancel(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.fromContent && !current.directionLocked) return;
    applyStage(stageRef.current, false);
  }

  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!mobile) return;
    const index = STAGES.indexOf(stageRef.current);
    if (event.key === "ArrowUp") { event.preventDefault(); applyStage(STAGES[Math.min(2, index + 1)], false); }
    if (event.key === "ArrowDown") { event.preventDefault(); applyStage(STAGES[Math.max(0, index - 1)], false); }
    if (event.key === "Home") { event.preventDefault(); applyStage("collapsed", false); }
    if (event.key === "End") { event.preventDefault(); applyStage("expanded", false); }
  }

  return <div className="board-sheet-viewport"><aside
    ref={rootRef}
    className={`board-toolbox ${className} sheet-${stage}`}
    aria-label="보드 꾸미기 메뉴"
    aria-roledescription={mobile ? "드래그 가능한 꾸미기 패널" : undefined}
    data-sheet-stage={stage}
    data-sheet-dragging="false"
    data-sheet-ready={ready ? "true" : "false"}
    tabIndex={-1}
    style={{ "--sheet-expanded-height": "calc(100dvh - 5.5rem)", "--sheet-translate": "58dvh" } as CSSProperties}
  >
    <div
      className="board-sheet-grab-zone"
      role="slider"
      aria-label="꾸미기 패널 높이"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={STAGES.indexOf(stage)}
      aria-valuetext={STAGE_LABEL[stage]}
      aria-hidden={!mobile}
      tabIndex={mobile ? 0 : -1}
      onKeyDown={keyDown}
      onPointerDown={(event) => begin(event)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    ><i aria-hidden="true" /></div>
    <header>
      <div className="board-toolbox-heading"><span aria-hidden="true">✦</span><strong>{title}</strong></div>
      <div className="board-toolbox-header-actions">
        {headerAction}
      </div>
    </header>
    <div className="sheet-accessible-actions" aria-hidden={!mobile}>
      <button type="button" tabIndex={mobile ? 0 : -1} onClick={() => applyStage("expanded", false)} aria-label="꾸미기 패널 펼치기">펼치기</button>
      <button type="button" tabIndex={mobile ? 0 : -1} onClick={() => applyStage("collapsed", false)} aria-label="꾸미기 패널 접기">접기</button>
    </div>
    <div
      ref={contentRef}
      className="board-tool-content"
      inert={mobile && stage === "collapsed"}
      aria-hidden={mobile && stage === "collapsed"}
      onPointerDown={(event) => begin(event, true)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    >{children}</div>
  </aside></div>;

});
