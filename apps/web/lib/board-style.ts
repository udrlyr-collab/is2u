export const BOARD_PAPER_SHAPE_IDS = ["note", "speech", "title", "date", "caption"] as const;
export const BOARD_STORED_PAPER_SHAPE_IDS = [...BOARD_PAPER_SHAPE_IDS, "scribble"] as const;
export const BOARD_TEXT_STYLE_IDS = ["default", "scribble"] as const;

export type BoardPaperShape = (typeof BOARD_PAPER_SHAPE_IDS)[number];
export type BoardStoredPaperShape = (typeof BOARD_STORED_PAPER_SHAPE_IDS)[number];
export type BoardTextStyle = (typeof BOARD_TEXT_STYLE_IDS)[number];
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
  shadow?: string;
};

export type NormalizedBoardPieceStyle = Omit<BoardPieceStyle, "shape"> & { shape?: BoardPaperShape };

const paperShapeIds = new Set<string>(BOARD_PAPER_SHAPE_IDS);
const textStyleIds = new Set<string>(BOARD_TEXT_STYLE_IDS);
const paperShapeById = new Map<BoardPaperShape, BoardPaperShapeDefinition>(
  BOARD_PAPER_SHAPES.map((definition) => [definition.id, definition]),
);

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
  const normalized = normalizeBoardPieceStyle(shape ? { shape } : undefined, elementType);
  const definition = BOARD_PAPER_SHAPES.find((candidate) => candidate.id === normalized.shape);
  return definition ? { width: definition.width, height: definition.height } : { width: 240, height: 190 };
}
