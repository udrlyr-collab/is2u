export const BOARD_PAPER_SHAPE_IDS = ["note", "speech", "title", "date", "caption"] as const;
export const BOARD_STORED_PAPER_SHAPE_IDS = [...BOARD_PAPER_SHAPE_IDS, "scribble"] as const;
export const BOARD_TEXT_STYLE_IDS = ["default", "scribble"] as const;
export const BOARD_STICKERS = [
  { id: "sparkle", label: "반짝이", glyph: "✦" },
  { id: "heart", label: "하트", glyph: "♡" },
  { id: "star", label: "별", glyph: "☆" },
  { id: "flower", label: "꽃", glyph: "✿" },
  { id: "moon", label: "달", glyph: "☾" },
  { id: "sun", label: "햇살", glyph: "☼" },
  { id: "music", label: "노래", glyph: "♫" },
  { id: "smile", label: "미소", glyph: "☺" },
  { id: "clover", label: "클로버", glyph: "♧" },
  { id: "arrow", label: "화살표", glyph: "↝" },
  { id: "tape", label: "테이프", glyph: "▱" },
  { id: "bow", label: "리본", glyph: "⋈" },
] as const;
export const BOARD_STICKER_IDS = BOARD_STICKERS.map((sticker) => sticker.id) as [
  (typeof BOARD_STICKERS)[number]["id"],
  ...(typeof BOARD_STICKERS)[number]["id"][],
];
export const BOARD_STICKER_VARIANT_IDS = ["outline", "filled"] as const;

export type BoardPaperShape = (typeof BOARD_PAPER_SHAPE_IDS)[number];
export type BoardStoredPaperShape = (typeof BOARD_STORED_PAPER_SHAPE_IDS)[number];
export type BoardTextStyle = (typeof BOARD_TEXT_STYLE_IDS)[number];
export type BoardStickerId = (typeof BOARD_STICKERS)[number]["id"];
export type BoardStickerVariant = (typeof BOARD_STICKER_VARIANT_IDS)[number];
export type BoardStyleElementType = "memory" | "image" | "note" | "label" | "sticker" | "bundle";

export type BoardPaperShapeDefinition = {
  id: BoardPaperShape;
  elementType: "note" | "label";
  label: string;
  description: string;
  width: number;
  height: number;
};

export type BoardTextStyleDefinition = {
  id: BoardTextStyle;
  label: string;
  description: string;
};

export const BOARD_PAPER_SHAPES = [
  { id: "note", elementType: "note", label: "메모지", description: "자유롭게 적는 작은 종이예요", width: 240, height: 190 },
  { id: "speech", elementType: "note", label: "말풍선 메모", description: "짧은 말을 포근하게 감싸요", width: 240, height: 190 },
  { id: "title", elementType: "label", label: "제목 라벨", description: "보드의 한 구역에 이름을 붙여요", width: 300, height: 110 },
  { id: "date", elementType: "label", label: "날짜 스탬프", description: "보드 위에 날짜를 표시해요", width: 240, height: 100 },
  { id: "caption", elementType: "note", label: "짧은 설명", description: "사진이나 추억 곁에 설명을 붙여요", width: 280, height: 150 },
] as const satisfies readonly BoardPaperShapeDefinition[];

export const BOARD_TEXT_STYLES = [
  { id: "default", label: "기본", description: "단정한 글씨로 적어요" },
  { id: "scribble", label: "낙서형", description: "손으로 끄적인 듯 적어요" },
] as const satisfies readonly BoardTextStyleDefinition[];

export type BoardPieceStyle = {
  color?: string;
  attachment?: string;
  shape?: BoardStoredPaperShape;
  textStyle?: BoardTextStyle;
  sticker?: string;
  stickerVariant?: BoardStickerVariant;
  shadow?: string;
  dateStart?: string;
  dateEnd?: string;
};

export type NormalizedBoardPieceStyle = Omit<BoardPieceStyle, "shape"> & { shape?: BoardPaperShape };

const paperShapeIds = new Set<string>(BOARD_PAPER_SHAPE_IDS);
const textStyleIds = new Set<string>(BOARD_TEXT_STYLE_IDS);
const boardDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function normalizeBoardText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function isSafeBoardText(value: string): boolean {
  return value.length <= 500 && !/[<>\u0000-\u0009\u000b-\u001f\u007f]/u.test(value);
}
const paperShapeById = new Map<BoardPaperShape, BoardPaperShapeDefinition>(
  BOARD_PAPER_SHAPES.map((definition) => [definition.id, definition]),
);

export function isValidBoardDate(value: string | undefined): value is string {
  if (!value) return false;
  const matched = boardDatePattern.exec(value);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatBoardDate(value: string): string {
  const matched = boardDatePattern.exec(value);
  return matched && isValidBoardDate(value) ? `${matched[1]}. ${matched[2]}. ${matched[3]}` : "";
}

export function formatBoardDateRange(start: string, end?: string): string {
  const startLabel = formatBoardDate(start);
  if (!startLabel) return "";
  if (!end || end === start) return startLabel;
  const endLabel = formatBoardDate(end);
  return endLabel && end >= start ? `${startLabel} - ${endLabel}` : "";
}

function defaultPaperShape(elementType?: BoardStyleElementType | string): BoardPaperShape | undefined {
  if (elementType === "note") return "note";
  if (elementType === "label") return "title";
  return undefined;
}

/**
 * Converts style data into the current paper/text contract without dropping
 * unrelated style fields. The old `shape: "scribble"` value represented a
 * text treatment, so it is translated to a real paper shape plus the new
 * `textStyle: "scribble"` field.
 */
export function normalizeBoardPieceStyle(
  style: Record<string, string | undefined> | null | undefined,
  elementType?: BoardStyleElementType | string,
): NormalizedBoardPieceStyle {
  const source = Object.fromEntries(Object.entries(style ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const rawShape = source.shape;
  const normalized = source as NormalizedBoardPieceStyle;
  const fallbackShape = defaultPaperShape(elementType);
  let candidateShape: BoardPaperShape | undefined;

  if (rawShape === "scribble") {
    candidateShape = fallbackShape;
    if (fallbackShape) normalized.textStyle = "scribble";
  } else if (rawShape && paperShapeIds.has(rawShape)) {
    candidateShape = rawShape as BoardPaperShape;
  } else {
    candidateShape = fallbackShape;
  }

  const compatibleShape = candidateShape && paperShapeById.get(candidateShape)?.elementType === elementType
    ? candidateShape
    : fallbackShape;
  if (compatibleShape) normalized.shape = compatibleShape;
  else delete normalized.shape;

  if (normalized.shape !== "date") {
    delete normalized.dateStart;
    delete normalized.dateEnd;
  } else {
    if (!isValidBoardDate(normalized.dateStart)) delete normalized.dateStart;
    if (!isValidBoardDate(normalized.dateEnd) || !normalized.dateStart || normalized.dateEnd < normalized.dateStart) delete normalized.dateEnd;
  }

  if (!BOARD_STICKER_VARIANT_IDS.includes(normalized.stickerVariant as BoardStickerVariant)) delete normalized.stickerVariant;

  if (!fallbackShape) delete normalized.textStyle;
  else {
    if (normalized.textStyle && !textStyleIds.has(normalized.textStyle)) delete normalized.textStyle;
    if (!normalized.textStyle) normalized.textStyle = "default";
  }

  return normalized;
}

export function boardPaperDimensions(
  elementType: BoardStyleElementType | string,
  shape?: BoardStoredPaperShape | string,
): { width: number; height: number } {
  if (elementType === "sticker") return { width: 150, height: 150 };
  const normalized = normalizeBoardPieceStyle(shape ? { shape } : undefined, elementType);
  const definition = BOARD_PAPER_SHAPES.find((candidate) => candidate.id === normalized.shape);
  return definition ? { width: definition.width, height: definition.height } : { width: 240, height: 190 };
}
