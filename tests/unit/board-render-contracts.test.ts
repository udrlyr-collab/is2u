import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  BOARD_PAPER_SHAPE_IDS,
  BOARD_PAPER_SHAPES,
  BOARD_STICKER_IDS,
  BOARD_STICKERS,
  BOARD_STICKER_VARIANT_IDS,
  BOARD_STORED_PAPER_SHAPE_IDS,
  BOARD_TEXT_STYLE_IDS,
  BOARD_TEXT_STYLES,
  boardPaperDimensions,
  formatBoardDateRange,
  isSafeBoardText,
  normalizeBoardText,
  normalizeBoardPieceStyle,
} from "../../apps/web/lib/board-style";
import { shortPaperLabel, type BoardItem } from "../../apps/web/app/(private)/board/board-types";

const VIEW_PATH = "apps/web/app/(private)/board/board-view.tsx";
const RENDERER_PATH = "apps/web/app/(private)/board/board-renderer.tsx";
const STYLES_PATH = "apps/web/app/globals.css";

describe("board rendering contracts", () => {
  it("uses one artwork tree for the live board and export with an explicit capturable surface", async () => {
    const [view, renderer] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(RENDERER_PATH, "utf8"),
    ]);

    expect(renderer).toContain('className="board-surface"');
    expect(renderer).toContain('className="board-frame-surface"');
    expect(renderer).toContain('patternUnits="userSpaceOnUse"');
    expect(renderer).toContain("<linearGradient");
    expect(renderer).toContain('className="board-object-ground"');
    expect(renderer).toContain("export function BoardArtwork");
    expect(view.match(/<BoardArtwork/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(view).toContain('mode="export"');
    expect(view).toContain("board-share-capture${includeExportFooter");
    expect(view).toContain("board-export-footer");
  });

  it("keeps continuous board bases separate from transparent repeating texture overlays", async () => {
    const renderer = await readFile(RENDERER_PATH, "utf8");
    const texturePatterns = renderer.match(/<pattern\b[\s\S]*?<\/pattern>/g) ?? [];

    expect(renderer).toContain('className="board-cork-base"');
    expect(renderer).toContain('className="board-cork-shade"');
    expect(renderer).toContain('className="board-cork-fibers"');
    expect(renderer).toContain('className="board-frame-base"');
    expect(renderer).toContain('className="board-frame-grain"');
    expect(texturePatterns.length).toBeGreaterThanOrEqual(4);
    for (const pattern of texturePatterns) expect(pattern).not.toMatch(/<rect\b/);
  });

  it("waits for fonts, decoded images and two layout frames before capturing", async () => {
    const view = await readFile(VIEW_PATH, "utf8");
    const helperStart = view.indexOf("export async function waitForBoardCaptureReady");
    const exportStart = view.indexOf("async function exportBoard");
    const canvasCall = view.indexOf("html2canvas(capture", exportStart);
    const readinessHelper = view.slice(helperStart, exportStart);
    const exportPreparation = view.slice(exportStart, canvasCall);

    expect(helperStart).toBeGreaterThan(-1);
    expect(exportStart).toBeGreaterThan(-1);
    expect(canvasCall).toBeGreaterThan(exportStart);
    expect(readinessHelper).toContain("await document.fonts.ready");
    expect(readinessHelper).toContain("image.decode()");
    expect(readinessHelper.match(/requestAnimationFrame/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(exportPreparation).toContain("await waitForBoardCaptureReady(capture)");
  });

  it("uses the full viewer width until the desktop toolbox is actually open", async () => {
    const [view, styles] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(view).toContain("board-toolbox-slot");
    expect(view).toContain("payload.canEdit && editMode && panelOpen && <div className=\"board-toolbox-slot\"");
    expect(view).not.toContain("can-decorate");
    expect(view).not.toMatch(/rawWidth\s*\+\s*364/);
    expect(view).not.toMatch(/contentRect\.width\s*\+\s*364/);
    expect(styles).not.toContain(".board-workspace.can-decorate");
    expect(styles).not.toContain(".memory-board-screen.is-editing .board-zoom-controls");
    expect(styles).toMatch(/\.board-workspace\.has-toolbox\s*\{[^}]*grid-template-columns:/s);
    expect(styles).toMatch(/\.board-toolbox-slot\s*\{/s);
    expect(styles).toMatch(/\.board-bottom-sheet\.desktop-toolbox\s*\{[^}]*position:\s*sticky/s);
    expect(styles).toMatch(/@media\s*\(min-width:\s*740px\)\s*and\s*\(min-height:\s*501px\)/);
  });

  it("previews board adjustments without rerendering the full artwork on every input", async () => {
    const [view, renderer] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(RENDERER_PATH, "utf8"),
    ]);

    expect(view).toContain("previewBoardItemsDOM");
    expect(view).toContain("nextItemGeometry");
    expect(view).toContain("flushDOMUpdate");
    expect(view).toContain("pendingThreadCurve");
    expect(view).toContain("onPointerCancel={commitThreadCurvePreview}");
    expect(view).toContain("onBlur={commitThreadCurvePreview}");
    expect(view).toContain("onInput={(event)");
    expect(view).toContain("defaultValue={selectedItem.width}");
    expect(renderer).toContain('const eager = mode === "export" || mode === "thumbnail" || eagerImages');
    expect(renderer).toContain('const eager = mode === "export" || eagerImages');
    expect(renderer).not.toContain('mode === "edit" || eagerImages');
  });

  it("keeps shadows and selection decoration on visual layers only", async () => {
    const [renderer, styles] = await Promise.all([
      readFile(RENDERER_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(renderer).toContain('className="board-piece-surface"');
    expect(renderer).toContain('className="board-selection-outline"');
    expect(renderer).toContain('mode === "export" && style.shadow !== "none" && item.elementType !== "sticker"');
    expect(renderer).toContain("board-export-piece-shadow");
    expect(styles).toMatch(/\.board-export-piece-shadow\s*\{[^}]*background:[^}]*transform:/s);
    expect(styles).toMatch(/\.board-piece\.shadow-firm\s*>\s*\.board-export-piece-shadow/);
    expect(styles).toMatch(/\.board-piece\.piece-image\s*>\s*\.board-export-piece-shadow/);
    expect(styles).toMatch(/\.board-share-capture\s+\.board-object-ground\s*\{\s*display:\s*none/);
    expect(styles).toMatch(/\.board-share-capture\s+\.board-piece\.piece-sticker\.shadow-soft\s+\.board-free-sticker\s*\{\s*filter:\s*drop-shadow/);
    expect(styles).toMatch(/\.board-share-capture\s+\.board-piece\.piece-sticker\.shadow-none\s+\.board-free-sticker\s*\{\s*filter:\s*none/);
    expect(styles).toMatch(/\.board-piece\.shadow-firm\s*>\s*\.board-piece-surface/);
    expect(styles).toMatch(/\.board-piece\.shadow-none\s*>\s*\.board-piece-surface/);
    expect(styles).toMatch(/\.board-piece\.piece-note\.shadow-soft\s+\.board-free-note/);
    expect(styles).toMatch(/\.board-piece\.piece-note\s*>\s*\.board-piece-surface[^{]*\{\s*box-shadow:\s*none/s);
    expect(styles).not.toMatch(/\.board-piece\.shadow-[\w-]+\s*>\s*\*/);
    expect(styles).not.toMatch(/\.board-piece\.(?:selected|multi-selected)::(?:before|after)/);

    const surface = renderer.indexOf('className="board-piece-surface"');
    const resizeHandle = renderer.indexOf('className="piece-resize-handle"');
    const rotateHandle = renderer.indexOf('className="piece-rotate-handle"');
    expect(surface).toBeGreaterThan(-1);
    expect(resizeHandle).toBeGreaterThan(surface);
    expect(rotateHandle).toBeGreaterThan(surface);
  });

  it("makes the export footer optional and checked by default", async () => {
    const [view, styles] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(view).toContain("const [includeExportFooter, setIncludeExportFooter] = useState(true)");
    expect(view).toContain("setIncludeExportFooter(true)");
    expect(view).toContain('type="checkbox"');
    expect(view).toContain("checked={includeFooter}");
    expect(view).toContain("onIncludeFooterChange(event.currentTarget.checked)");
    expect(view).toContain("const exportHeight = BOARD_HEIGHT + (includeExportFooter ? BOARD_EXPORT_FOOTER_HEIGHT : 0)");
    expect(view).toContain("height: exportHeight");
    expect(view).toContain("windowHeight: exportHeight");
    expect(view).toContain("{includeExportFooter && (");
    expect(styles).toContain(".board-share-capture.without-footer { height: 1400px; }");
  });

  it("renders a saved board memo beside the export title without letting either label overflow", async () => {
    const [view, styles] = await Promise.all([readFile(VIEW_PATH, "utf8"), readFile(STYLES_PATH, "utf8")]);
    expect(view).toContain("payload?.board.description && <span>{payload.board.description}</span>");
    expect(styles).toContain(".export-footer-title > strong");
    expect(styles).toContain(".export-footer-title > span");
    expect(styles).toMatch(/\.export-footer-title\s*\{[^}]*flex:\s*1 1 0/s);
    expect(styles).toMatch(/\.export-footer-title > strong\s*\{[^}]*max-width:\s*58%/s);
    expect(styles).toMatch(/\.export-footer-title > span\s*\{[^}]*font-weight:\s*350/s);
    expect(styles).toMatch(/\.export-footer-title > strong,\s*\.export-footer-title > span\s*\{[^}]*text-overflow:\s*ellipsis/s);
  });
});

describe("board paper style contracts", () => {
  it("stores paper shape and text style as separate dimensions", () => {
    expect(BOARD_PAPER_SHAPE_IDS).toEqual(["note", "speech", "title", "date", "caption"]);
    expect(BOARD_STORED_PAPER_SHAPE_IDS).toEqual(["note", "speech", "title", "date", "caption", "scribble"]);
    expect(BOARD_TEXT_STYLE_IDS).toEqual(["default", "scribble"]);
    expect(BOARD_PAPER_SHAPES.map(({ id }) => id)).toEqual(BOARD_PAPER_SHAPE_IDS);
    expect(BOARD_TEXT_STYLES.map(({ id }) => id)).toEqual(BOARD_TEXT_STYLE_IDS);
    expect(BOARD_PAPER_SHAPES.find(({ id }) => id === "date")).toMatchObject({
      elementType: "label",
      label: "날짜 스탬프",
      description: "보드 위에 날짜를 표시해요",
    });

    expect(normalizeBoardPieceStyle({ shape: "title", textStyle: "scribble" }, "label")).toMatchObject({
      shape: "title",
      textStyle: "scribble",
    });
    expect(normalizeBoardPieceStyle({ shape: "note", textStyle: "default" }, "note")).toMatchObject({
      shape: "note",
      textStyle: "default",
    });
    expect(normalizeBoardPieceStyle({ shape: "speech" }, "label")).toMatchObject({
      shape: "title",
      textStyle: "default",
    });
    expect(normalizeBoardPieceStyle({ shape: "date" }, "note")).toMatchObject({
      shape: "note",
      textStyle: "default",
    });
    expect(normalizeBoardPieceStyle({ shape: "title", textStyle: "scribble" }, "memory")).not.toHaveProperty("shape");
    expect(normalizeBoardPieceStyle({ shape: "title", textStyle: "scribble" }, "memory")).not.toHaveProperty("textStyle");
  });

  it("applies the shared style contract in creation, persistence and rendering", async () => {
    const [view, renderer, route] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(RENDERER_PATH, "utf8"),
      readFile("apps/web/app/api/board/items/route.ts", "utf8"),
    ]);

    expect(view).toContain("BOARD_PAPER_SHAPES");
    expect(view).toContain("BOARD_TEXT_STYLES");
    expect(view).toContain("BoardNotePaper");
    expect(view).toContain("boardPaperDimensions");
    expect(renderer).toContain("normalizeBoardPieceStyle(item.styleJson, item.elementType)");
    expect(renderer).toContain("<BoardNotePaper");
    expect(renderer).toContain("text-${textStyle}");
    expect(route).toContain("z.enum(BOARD_STORED_PAPER_SHAPE_IDS)");
    expect(route).toContain("z.enum(BOARD_TEXT_STYLE_IDS)");
    expect(route).toContain("boardPaperDimensions");
    expect(route).toContain("formatBoardDateRange");
    expect(route).toContain("normalizeBoardText");
    expect(route).toContain("normalizeBoardPieceStyle(input.styleJson, input.elementType)");
  });

  it("normalizes the legacy scribble shape without changing stored rows", () => {
    const legacyLabel = { shape: "scribble" } as const;
    expect(normalizeBoardPieceStyle(legacyLabel, "label")).toMatchObject({
      shape: "title",
      textStyle: "scribble",
    });
    expect(legacyLabel).toEqual({ shape: "scribble" });
    expect(normalizeBoardPieceStyle({ shape: "scribble" }, "note")).toMatchObject({
      shape: "note",
      textStyle: "scribble",
    });
  });

  it("gives each paper preset stable live and preview dimensions", () => {
    for (const shape of BOARD_PAPER_SHAPE_IDS) {
      const dimensions = boardPaperDimensions(shape === "title" || shape === "date" ? "label" : "note", shape);
      expect(dimensions.width).toBeGreaterThanOrEqual(80);
      expect(dimensions.height).toBeGreaterThanOrEqual(60);
    }
    expect(boardPaperDimensions("label", "scribble")).toEqual(boardPaperDimensions("label", "title"));
    expect(boardPaperDimensions("sticker")).toEqual({ width: 150, height: 150 });
  });

  it("uses one sticker catalog across creation, validation, rendering and editing", async () => {
    const [view, renderer, controls, route, graphic] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(RENDERER_PATH, "utf8"),
      readFile("apps/web/app/(private)/board/board-controls.tsx", "utf8"),
      readFile("apps/web/app/api/board/items/route.ts", "utf8"),
      readFile("apps/web/app/(private)/board/board-sticker-graphic.tsx", "utf8"),
    ]);

    expect(BOARD_STICKERS).toHaveLength(12);
    expect(BOARD_STICKER_IDS).toEqual(BOARD_STICKERS.map(({ id }) => id));
    expect(new Set(BOARD_STICKER_IDS).size).toBe(BOARD_STICKER_IDS.length);
    expect(BOARD_STICKER_VARIANT_IDS).toEqual(["outline", "filled"]);
    expect(route).toContain('"memory", "image", "note", "label", "sticker"');
    expect(route).toContain("z.enum(BOARD_STICKER_IDS)");
    expect(route).toContain("z.enum(BOARD_STICKER_VARIANT_IDS)");
    expect(route).toContain("idempotencyKey: z.uuid().optional()");
    expect(renderer).toContain("BOARD_STICKERS.find");
    expect(renderer).toContain("style.stickerVariant ?? \"outline\"");
    expect(controls).toContain("BOARD_STICKERS.map");
    expect(controls).toContain("StickerVariantPicker");
    expect(graphic).toContain('variant === "filled"');
    expect(view).toContain("<StickerDialog");
    expect(view).toContain("<StickerPicker");
    expect(view).toContain("<StickerVariantPicker");
  });

  it("accepts multiline paper notes while continuing to reject unsafe control characters", () => {
    expect(normalizeBoardText("  첫 줄\r\n둘째 줄  ")).toBe("첫 줄\n둘째 줄");
    expect(isSafeBoardText("첫 줄\n둘째 줄")).toBe(true);
    expect(isSafeBoardText("메모\u0000")).toBe(false);
    expect(isSafeBoardText("<script>")).toBe(false);
    expect(isSafeBoardText("가".repeat(501))).toBe(false);
  });

  it("formats one-day and ranged date labels without timezone conversion", () => {
    expect(formatBoardDateRange("2026-07-17")).toBe("2026. 07. 17");
    expect(formatBoardDateRange("2026-07-17", "2026-07-19")).toBe("2026. 07. 17 - 2026. 07. 19");
    expect(formatBoardDateRange("2026-07-17", "2026-07-17")).toBe("2026. 07. 17");
    expect(formatBoardDateRange("2026-02-30")).toBe("");
    expect(formatBoardDateRange("2026-07-19", "2026-07-17")).toBe("");
    expect(normalizeBoardPieceStyle({ shape: "date", dateStart: "2026-07-17", dateEnd: "2026-07-19" }, "label")).toMatchObject({ dateStart: "2026-07-17", dateEnd: "2026-07-19" });
  });

  it("keeps long board labels short in the toolbox while the full accessible label stays separate", async () => {
    const memory = { elementType: "memory", memory: { title: "최후의 만찬이 이런 모습이었을까 정말 궁금한 오늘의 추억" } } as BoardItem;
    const bundle = { elementType: "bundle", group: { name: "아주 길고 길어서 패널을 밀어내면 안 되는 추억 번들" } } as BoardItem;
    expect(Array.from(shortPaperLabel(memory))).toHaveLength(18);
    expect(shortPaperLabel(memory).endsWith("…")).toBe(true);
    expect(shortPaperLabel(bundle).endsWith("…")).toBe(true);

    const [view, styles] = await Promise.all([readFile(VIEW_PATH, "utf8"), readFile(STYLES_PATH, "utf8")]);
    expect(view).toContain("shortPaperLabel(selectedItem)");
    expect(styles).toMatch(/\.board-toolbox > header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
    expect(styles).toMatch(/\.compact-adjuster input, \.thread-curve-controls input\s*\{[^}]*min-width:\s*0/s);
    expect(styles).toContain("@media (max-width: 360px)");
  });

  it("scales memory decorations and exposes visual attachment and memory theme controls", async () => {
    const [view, controls, renderer, styles] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile("apps/web/app/(private)/board/board-controls.tsx", "utf8"),
      readFile(RENDERER_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(controls).toContain('role="radiogroup" aria-label="붙이는 방법"');
    expect(controls).toContain("attachment-choice-preview");
    expect(controls).toContain('event.key === "ArrowRight"');
    expect(controls).toContain("tabIndex={value === option.id ? 0 : -1}");
    expect(view).toContain("추억 분위기");
    expect(view).toContain("usePaperDialogFocus");
    expect(view).toContain('event.key === "Escape"');
    expect(view).toContain("applyItemSelection");
    expect(view).toContain("enteredByShift && next.length > 1");
    expect(renderer).toContain('style.color ? " has-piece-color"');
    expect(styles).toContain(".piece-memory.has-piece-color.color-butter");
    expect(styles).toContain(".piece-memory .board-pin");
    expect(styles).toContain(".piece-bundle .board-group-label strong");
    expect(styles).toContain("cqw");
  });
});

describe("shared detail topline contract", () => {
  it("keeps back navigation and the eyebrow label on one shared row", async () => {
    const paths = [
      VIEW_PATH,
      "apps/web/app/(private)/board/groups/[id]/group-view.tsx",
      "apps/web/app/(private)/dates/[id]/date-detail.tsx",
      "apps/web/app/(private)/memories/[id]/page.tsx",
      "apps/web/app/(private)/missions/[id]/page.tsx",
      "apps/web/app/(private)/settings/profile/page.tsx",
      "apps/web/app/(private)/settings/connection/page.tsx",
      "apps/web/app/history/page.tsx",
    ];
    const [component, styles, ...pages] = await Promise.all([
      readFile("apps/web/components/detail-topline.tsx", "utf8"),
      readFile(STYLES_PATH, "utf8"),
      ...paths.map((path) => readFile(path, "utf8")),
    ]);

    expect(component).toContain('className="detail-topline"');
    expect(component).toContain('className="detail-topline-separator"');
    for (const page of pages) expect(page).toContain("<DetailTopline");
    const toplineRule = styles.match(/\.detail-topline\s*\{([^}]*)\}/s)?.[1] ?? "";
    expect(toplineRule).toContain("display: flex");
    expect(toplineRule).toContain("flex-wrap: nowrap");
  });
});
