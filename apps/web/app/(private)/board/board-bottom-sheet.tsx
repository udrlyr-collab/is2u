"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type SheetStage = "collapsed" | "middle" | "expanded";
export type BoardBottomSheetHandle = {
  openToMiddle: () => void;
  collapse: () => void;
  stage: () => SheetStage;
};

const STAGE_LABEL: Record<SheetStage, string> = { collapsed: "접힘", middle: "중간", expanded: "펼침" };
const STAGES: SheetStage[] = ["collapsed", "middle", "expanded"];
const MOBILE_SHEET_QUERY = "(max-width: 739px), (max-height: 500px)";

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
  const drag = useRef<{ pointerId: number; startY: number; startVisible: number; lastY: number; lastAt: number; velocity: number; moved: boolean } | null>(null);

  const measurements = useCallback(() => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    return stageHeights(height);
  }, []);

  const applyStage = useCallback((next: SheetStage, announce = true) => {
    stageRef.current = next;
    setStageState(next);
    const element = rootRef.current;
    if (element && window.matchMedia(MOBILE_SHEET_QUERY).matches) {
      const heights = measurements();
      element.style.setProperty("--sheet-expanded-height", `${heights.expanded}px`);
      element.style.setProperty("--sheet-translate", `${heights.expanded - heights[next]}px`);
      element.dataset.sheetDragging = "false";
    }
    if (next === "collapsed") onCollapsed?.();
    if (announce) window.requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
  }, [measurements, onCollapsed]);

  useImperativeHandle(forwardedRef, () => ({
    openToMiddle: () => { if (stageRef.current === "collapsed") applyStage("middle", false); },
    collapse: () => applyStage("collapsed", false),
    stage: () => stageRef.current,
  }), [applyStage]);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_SHEET_QUERY);
    const sync = () => { setMobile(query.matches); if (query.matches) applyStage(stageRef.current, false); };
    sync(); query.addEventListener("change", sync);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => { query.removeEventListener("change", sync); viewport?.removeEventListener("resize", sync); window.removeEventListener("orientationchange", sync); };
  }, [applyStage]);

  function begin(event: ReactPointerEvent<HTMLElement>, fromContent = false) {
    if (!mobile || event.button !== 0) return;
    if (fromContent) {
      const target = event.target as HTMLElement;
      if (contentRef.current?.scrollTop !== 0 || target.closest("button,input,textarea,select,label,a,[data-no-sheet-drag]")) return;
    }
    const heights = measurements();
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startVisible: heights[stageRef.current], lastY: event.clientY, lastAt: performance.now(), velocity: 0, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    rootRef.current?.setAttribute("data-sheet-dragging", "true");
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !rootRef.current) return;
    const delta = event.clientY - current.startY;
    if (Math.abs(delta) > 3) current.moved = true;
    if (!current.moved) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(1, now - current.lastAt);
    current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY; current.lastAt = now;
    const heights = measurements();
    const visible = Math.min(heights.expanded, Math.max(heights.collapsed, current.startVisible - delta));
    rootRef.current.style.setProperty("--sheet-expanded-height", `${heights.expanded}px`);
    rootRef.current.style.setProperty("--sheet-translate", `${heights.expanded - visible}px`);
  }

  function end(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
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

  return <aside
    ref={rootRef}
    className={`board-toolbox ${className} sheet-${stage}`}
    aria-label="보드 꾸미기 메뉴"
    aria-roledescription={mobile ? "드래그 가능한 꾸미기 패널" : undefined}
    data-sheet-stage={stage}
    data-sheet-dragging="false"
    tabIndex={-1}
    style={{ "--sheet-expanded-height": "760px", "--sheet-translate": "0px" } as CSSProperties}
  >
    {mobile && (
      <div
        className="board-sheet-grab-zone"
        role="slider"
        aria-label="꾸미기 패널 높이"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={STAGES.indexOf(stage)}
        aria-valuetext={STAGE_LABEL[stage]}
        tabIndex={0}
        onKeyDown={keyDown}
        onPointerDown={(event) => begin(event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
      ><i aria-hidden="true" /></div>
    )}
    <header>
      <div className="board-toolbox-heading"><span aria-hidden="true">✦</span><strong>{title}</strong></div>
      <div className="board-toolbox-header-actions">
        {headerAction}
      </div>
    </header>
    {mobile && (
      <div className="sheet-accessible-actions">
        <button type="button" onClick={() => applyStage("expanded", false)} aria-label="꾸미기 패널 펼치기">펼치기</button>
        <button type="button" onClick={() => applyStage("collapsed", false)} aria-label="꾸미기 패널 접기">접기</button>
      </div>
    )}
    <div
      ref={contentRef}
      className="board-tool-content"
      onPointerDown={(event) => begin(event, true)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    >{children}</div>
  </aside>;

});
