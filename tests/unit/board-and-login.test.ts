import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeMissionIntervalInputs } from "@is2u/core/mission-interval";
import { boundedGroupDelta, hangingPoint, linkingPaths } from "../../apps/web/app/(private)/board/board-geometry";
import type { BoardItem, BoardThread } from "../../apps/web/app/(private)/board/board-types";

describe("login, interval inputs and memory boards", () => {
  it("keeps grouped board movement in bounds and lays hanging items on the rope curve", () => {
    const pieces = [{ x: 20, y: 30, width: 100, height: 80 }, { x: 1660, y: 1260, width: 120, height: 100 }] as BoardItem[];
    expect(boundedGroupDelta(pieces, -100, 200)).toEqual({ dx: -20, dy: 40 });
    const thread = { startX: 100, startY: 100, endX: 500, endY: 100, curve: 100 } as BoardThread;
    const middle = hangingPoint(thread, 0.5);
    expect(middle.x).toBe(300);
    expect(middle.y).toBe(150);

    const first = { id: "first", x: 10, y: 20, width: 100, height: 80 } as BoardItem;
    const second = { id: "second", x: 400, y: 300, width: 120, height: 90 } as BoardItem;
    const linking = { itemIds: [second.id, first.id], curve: 0 } as BoardThread;
    expect(linkingPaths(linking, new Map([[first.id, first], [second.id, second]]))[0]).toMatch(/^M 460 345 Q /);
  });
  it("allows empty mobile interval input and normalizes on commit", () => {
    expect(normalizeMissionIntervalInputs("5", "90", { min: 40, max: 90 }, "min")).toEqual({ min: 10, max: 90 });
    expect(normalizeMissionIntervalInputs("300", "90", { min: 40, max: 90 }, "min")).toEqual({ min: 240, max: 240 });
    expect(normalizeMissionIntervalInputs("", "90", { min: 40, max: 90 }, "min")).toEqual({ min: 40, max: 90 });
    expect(normalizeMissionIntervalInputs("abc", "90", { min: 40, max: 90 }, "min")).toEqual({ min: 40, max: 90 });
    expect(normalizeMissionIntervalInputs("100", "60", { min: 40, max: 90 }, "min")).toEqual({ min: 100, max: 100 });
    expect(normalizeMissionIntervalInputs("100", "60", { min: 40, max: 90 }, "max")).toEqual({ min: 60, max: 60 });
  });

  it("verifies credentials before applying failed-attempt blocking and confirms the saved session", async () => {
    const [route, form] = await Promise.all([
      readFile("apps/web/app/api/auth/login/route.ts", "utf8"),
      readFile("apps/web/app/(auth)/login/login-form.tsx", "utf8"),
    ]);
    expect(route.indexOf("const valid = await verifyPassword")).toBeLessThan(route.indexOf("const failures = await failedLoginCount"));
    expect(route).toContain("LOGIN_LIMIT_ERROR");
    expect(form).toContain('apiFetch<{ authenticated: boolean }>("/api/auth/session")');
    expect(form).toContain("submitting.current");
    expect(form).toContain("로그인 정보를 확인하고 있어요");
  });

  it("stores multiple finite boards with private assets, unique pins, bundles and rope members", async () => {
    const [schema, migration, boardRoute, itemRoute, groupRoute, threadRoute, assetRoute, header] = await Promise.all([
      readFile("packages/db/src/schema.ts", "utf8"),
      readFile("packages/db/migrations/0016_tense_franklin_storm.sql", "utf8"),
      readFile("apps/web/app/api/board/route.ts", "utf8"),
      readFile("apps/web/app/api/board/items/route.ts", "utf8"),
      readFile("apps/web/app/api/board/groups/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/board/threads/route.ts", "utf8"),
      readFile("apps/web/app/api/board/assets/route.ts", "utf8"),
      readFile("apps/web/app/(private)/site-header.tsx", "utf8"),
    ]);
    for (const table of ["memory_boards", "board_assets", "board_items", "board_threads", "board_thread_items", "memory_groups", "memory_group_items"]) expect(schema).toContain(`pgTable("${table}"`);
    expect(migration).toContain('DROP INDEX "memory_boards_owner_uidx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "board_items_asset_uidx"');
    expect(boardRoute).toContain('url.searchParams.get("list") === "1"');
    expect(boardRoute).toContain("DeleteObjectsCommand");
    expect(itemRoute).toContain("requireOwnedItem");
    expect(itemRoute).toContain('elementType: z.enum(elementTypes)');
    expect(groupRoute).toContain('throw new HttpError(403, "연인의 그룹은 바꿀 수 없어요")');
    expect(groupRoute).toContain("delete(memoryGroups)");
    expect(groupRoute).not.toContain("delete(memories)");
    expect(threadRoute).toContain("boardThreadItems");
    expect(threadRoute).toContain("itemIds: z.array(z.uuid()).min(2");
    expect(assetRoute).toContain('z.enum(["image/png", "image/jpeg", "image/webp"])');
    expect(assetRoute).toContain("createSingleUpload");
    expect(header).toContain('{ href: "/board", label: "보드"');
  });

  it("implements contextual editing, ordered multi-select connections and read-only partner boards", async () => {
    const [view, renderer, threadRoute, styles] = await Promise.all([
      readFile("apps/web/app/(private)/board/board-view.tsx", "utf8"),
      readFile("apps/web/app/(private)/board/board-renderer.tsx", "utf8"),
      readFile("apps/web/app/api/board/threads/route.ts", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    expect(view).toContain("onPointerDown={startCanvas}");
    expect(view).toContain("activePointers.current");
    expect(view).toContain("onPointerCancel={cancelCanvas}");
    expect(view).toContain("onLostPointerCapture={cancelCanvas}");
    expect(view).not.toContain("onPointerLeave={endCanvas}");
    expect(view).toContain('addEventListener("wheel", onWheel, { passive: false })');
    expect(view).toContain('addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(view).toContain("activePointers.current.size >= 2");
    expect(view).toContain("}, [payload?.board?.id]);");
    expect(view).toContain("discardQueuedDOMUpdate");
    expect(view).toContain("restoreSettledDragDOM");
    expect(view).toContain("hangingLayout(thread, hangingOrigin.items)");
    expect(view).toContain("itemSaveTimer");
    expect(view).toContain("viewportSaveTimer");
    expect(view).toContain("itemSaveInFlight");
    expect(view).toContain("viewportSaveInFlight");
    expect(view).toContain("saveFlushActions.current?.items(true)");
    expect(view).toContain("const merged = new Map");
    expect(view).not.toContain("const saveTimer =");
    expect(view).not.toContain("Compatibility comments");
    expect(renderer).not.toContain("Compatibility comment");
    expect(view).toContain("boundedGroupDelta");
    expect(view).toContain("items: persisted.map(itemPatch)");
    expect(view).toContain('method: "PATCH"');
    expect(view).not.toContain("실 추가");
    expect(view).not.toContain("모인 곳 보기");
    expect(view).toContain("실에 매달기");
    expect(view).toContain("실로 연결하기");
    expect(view).toContain("연결할 조각을 두 개 이상 골라주세요");
    expect(threadRoute).not.toContain('["image", "memory"]');
    expect(view).not.toContain("선택한 순서대로 펼치기");
    expect(view).toContain("selectedItemIds");
    expect(renderer).toContain("board-clothespin");
    expect(renderer).toContain('className={`rope rope-${thread.color}');
    expect(threadRoute).toContain('"warm-brown", "cream", "strawberry", "sky", "leaf", "lavender", "dark-brown"');
    expect(styles).toContain(".board-workspace, .board-workspace.has-toolbox");
    expect(styles).toContain(".piece-resize-handle");
    expect(styles).toContain(".piece-rotate-handle");
    expect(view).toContain("board-viewport-fixed");
    expect(view).toContain("payload?.canEdit");
    expect(view).toContain("구경하는 중");
    expect(view).toContain("저장하지 못했어요");
  });

  it("rejects board threads with fewer than two unique items after deduplication", async () => {
    const threadRoute = await readFile("apps/web/app/api/board/threads/route.ts", "utf8");
    const uniqueItemGuards = [...threadRoute.matchAll(
      /const itemIds = \[\.\.\.new Set\(input\.itemIds\)\];\s+if \(itemIds\.length < 2\) throw new HttpError\(400, "([^"]+)"\);/g,
    )].map((match) => match[1]);

    expect(uniqueItemGuards).toEqual([
      "연결할 조각을 두 개 이상 골라주세요",
      "실에는 조각을 두 개 이상 연결해 주세요",
    ]);
  });

  it("preserves transparent images and shares the common high-resolution board renderer", async () => {
    const [view, renderer, list, boardRoute, styles, memoryPage, boardContent, mediaContent] = await Promise.all([
      readFile("apps/web/app/(private)/board/board-view.tsx", "utf8"),
      readFile("apps/web/app/(private)/board/board-renderer.tsx", "utf8"),
      readFile("apps/web/app/(private)/board/board-list.tsx", "utf8"),
      readFile("apps/web/app/api/board/route.ts", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
      readFile("apps/web/app/(private)/memories/[id]/page.tsx", "utf8"),
      readFile("apps/web/app/api/board/assets/[id]/content/route.ts", "utf8"),
      readFile("apps/web/app/api/media/[assetId]/content/route.ts", "utf8"),
    ]);
    expect(styles).toContain(".board-free-image");
    expect(styles).toContain("object-fit: contain");
    expect(styles).not.toContain("100vw");
    expect(view).toContain("event.clientX, event.clientY");
    expect(view).toContain('import("html2canvas")');
    expect(view).toContain("scale: 2");
    expect(view).toContain("await document.fonts.ready");
    expect(view).toContain("const capture = shareCapture.current;");
    expect(view).toContain("height: BOARD_HEIGHT + BOARD_EXPORT_FOOTER_HEIGHT");
    expect(view).toContain("board-export-footer");
    expect(view).toContain("<BoardArtwork");
    expect(list).toContain("<ReadOnlyBoardPreview");
    expect(renderer).toContain("export function BoardArtwork");
    expect(renderer).toContain('className="bundle-memory-details"');
    expect(styles).toContain("position: relative; inset: auto; flex: 0 0 auto; transform-origin: 50% 50%");
    expect(styles).toContain("height: 1500px");
    expect(styles).toContain("flex: 0 0 1400px");
    expect(styles).toContain("font-family: var(--font-logo)");
    expect(renderer).toContain('className="board-piece-surface"');
    expect(renderer).toContain('className="board-object-ground"');
    expect(styles).toContain(".board-piece.shadow-firm > .board-piece-surface");
    expect(boardRoute).toContain("loadBoardArtwork");
    expect(boardContent).toContain("requireVisibleBoard");
    expect(mediaContent).toContain("canAccessMemory");
    expect(view).toContain("URL.createObjectURL(file)");
    expect(memoryPage).toContain('label={boardId ? "보드로" : "추억으로"}');
    expect(memoryPage).toContain('ariaLabel={boardId ? "보드로 돌아가기" : "추억 목록으로 돌아가기"}');
    expect(memoryPage).toContain("returnBoardId={boardId}");
  });

  it("opens complete memory bundles inside the board and restores navigation state", async () => {
    const [view, renderer, settings, history, releases] = await Promise.all([
      readFile("apps/web/app/(private)/board/board-view.tsx", "utf8"),
      readFile("apps/web/app/(private)/board/board-renderer.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/settings-panel.tsx", "utf8"),
      readFile("apps/web/app/history/page.tsx", "utf8"),
      readFile("apps/web/lib/releases.ts", "utf8"),
    ]);
    expect(view).toContain("group.memories");
    expect(view).not.toContain(".slice(0, 7)");
    expect(view).toContain("board-bundle-spread");
    expect(view).toContain("bundle-memory-collage");
    expect(view).toContain('role="dialog" aria-modal="true"');
    expect(view).toContain('event.key === "Escape"');
    expect(view).toContain('event.key !== "Tab"');
    expect(view).toContain("{openGroup && <BundleSpread");
    expect(view).not.toContain("animatingGroupId");
    expect(view).not.toContain("이전 추억");
    expect(view).not.toContain("다음 추억");
    expect(view).toContain("is2u-board-return:");
    expect(renderer).toContain("MemoryDetailCard");
    expect(settings).toContain('href="/design"');
    expect(settings).toContain('href="/history"');
    expect(history).toContain("RELEASE_NOTES");
    for (const note of ["Safari에서도 보드를", "보드 목록에서 코르크판", "공유 사진에 보드의 질감", "고른 보드 조각", "여러 장 고르기는", "추억 번들을 열면", "원래 색이 또렷하게"]) expect(releases).toContain(note);
  });

  it("uses a real three-stage mobile bottom sheet with live pointer tracking and accessible controls", async () => {
    const [sheet, view, styles] = await Promise.all([
      readFile("apps/web/app/(private)/board/board-bottom-sheet.tsx", "utf8"),
      readFile("apps/web/app/(private)/board/board-view.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    for (const stage of ["collapsed", "middle", "expanded"]) expect(sheet).toContain(stage);
    expect(sheet).toContain("setPointerCapture");
    expect(sheet).toContain("--sheet-translate");
    expect(sheet).toContain("current.velocity");
    expect(sheet).toContain("useLayoutEffect");
    expect(sheet).toContain("queueDragPosition");
    expect(sheet).toContain("directionLocked");
    expect(sheet).toContain("if (delta < 0)");
    expect(sheet).toContain('className="board-sheet-viewport"');
    expect(sheet).toContain('data-sheet-ready={ready ? "true" : "false"}');
    expect(sheet).toContain('inert={mobile && stage === "collapsed"}');
    expect(sheet).toContain('contentRef.current?.contains(document.activeElement)');
    expect(sheet).not.toContain('"--sheet-expanded-height": "760px"');
    expect(sheet).toContain('event.key === "ArrowUp"');
    expect(sheet).toContain('event.key === "ArrowDown"');
    expect(sheet).toContain("window.visualViewport");
    expect(styles).toContain("translate3d(0, var(--sheet-translate), 0)");
    expect(styles).toMatch(/\.board-sheet-viewport\s*\{[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(/\.board-bottom-sheet\.desktop-toolbox\s*\{[^}]*clip-path:\s*none/s);
    expect(styles).toMatch(/\.board-bottom-sheet\.desktop-toolbox\s*\{[^}]*animation:\s*none/s);
    expect(styles).toContain('data-sheet-dragging="true"');
    expect(styles).toContain("touch-action: none");
    expect(sheet).toContain("headerAction?: ReactNode");
    expect(view).toContain("headerAction={");
    expect(view).not.toContain("tool-header-bar");
    expect(styles).not.toContain('.multi-mode-toggle[aria-pressed="true"]::after');
  });

  it("keeps manually written notes in the shared timeline and excludes future pinned times", async () => {
    const [feed, home, styles] = await Promise.all([
      readFile("apps/web/app/api/missions/route.ts", "utf8"),
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    expect(feed).toContain("lte(memories.firstPinnedAt, now)");
    expect(feed).toContain('kind: "manual"');
    expect(home).toContain("memory-type-${entry.memory?.type");
    expect(styles).toContain(".memory-manual.memory-type-text");
  });
});
