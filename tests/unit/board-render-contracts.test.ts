import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  BOARD_PAPER_SHAPE_IDS,
  BOARD_PAPER_SHAPES,
  BOARD_STORED_PAPER_SHAPE_IDS,
  BOARD_TEXT_STYLE_IDS,
  BOARD_TEXT_STYLES,
  boardPaperDimensions,
  normalizeBoardPieceStyle,
} from "../../apps/web/lib/board-style";

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
    expect(view).toContain('className="board-share-capture"');
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

  it("reserves a stable desktop toolbox slot without synthesizing board width", async () => {
    const [view, styles] = await Promise.all([
      readFile(VIEW_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(view).toContain("board-toolbox-slot");
    expect(view).toContain("can-decorate");
    expect(view).not.toMatch(/rawWidth\s*\+\s*364/);
    expect(view).not.toMatch(/contentRect\.width\s*\+\s*364/);
    expect(styles).toContain(".board-workspace.can-decorate");
    expect(styles).toMatch(/\.board-workspace\.can-decorate\s*\{[^}]*grid-template-columns:/s);
    expect(styles).toMatch(/\.board-toolbox-slot\s*\{/s);
    expect(styles).toMatch(/\.board-bottom-sheet\.desktop-toolbox\s*\{[^}]*position:\s*sticky/s);
    expect(styles).toMatch(/@media\s*\(min-width:\s*900px\)\s*and\s*\(pointer:\s*fine\)/);
  });

  it("keeps shadows and selection decoration on visual layers only", async () => {
    const [renderer, styles] = await Promise.all([
      readFile(RENDERER_PATH, "utf8"),
      readFile(STYLES_PATH, "utf8"),
    ]);

    expect(renderer).toContain('className="board-piece-surface"');
    expect(renderer).toContain('className="board-selection-outline"');
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
