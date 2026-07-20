import type { MemoryType } from "@is2u/core/types";
import type { BoardPieceStyle } from "../../../lib/board-style";

export type BoardMode = "view" | "edit" | "thumbnail" | "export";

export type BoardAssetVariant = {
  id: string;
  role: "preview" | "thumbnail" | "poster";
  mimeType: string;
  durationMs?: number | null;
};

export type BoardMemory = {
  id: string;
  type: MemoryType;
  title: string;
  text: string | null;
  emotion: string | null;
  firstPinnedAt: string;
  author: { id: string; displayName: string; roleLabel: string };
  dateEvent: { id: string; title: string } | null;
  assets: BoardAssetVariant[];
};

export type BoardGroup = {
  id: string;
  name: string;
  note: string | null;
  style: string;
  representative: BoardMemory | null;
  count: number;
  memories: BoardMemory[];
  updatedAt: string;
};

export type BoardAsset = { id: string; mimeType: string; originalFilename: string; status: string };
export type PieceStyle = BoardPieceStyle;

export type BoardItem = {
  id: string;
  boardId: string;
  memoryId: string | null;
  groupId: string | null;
  assetId: string | null;
  elementType: "memory" | "image" | "note" | "label" | "sticker" | "bundle";
  textContent: string | null;
  styleJson: PieceStyle;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationTenths: number;
  zIndex: number;
  memory: BoardMemory | null;
  group: BoardGroup | null;
  asset: BoardAsset | null;
};

export type BoardThread = {
  id: string;
  mode: "hanging" | "linking";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  curve: number;
  color: string;
  itemIds: string[];
};

export type BoardViewport = { x: number; y: number; scale: number };

export type BoardPayload = {
  owner: { id: string; displayName: string; roleLabel: string; connected: boolean };
  canEdit: boolean;
  board: { id: string; title: string; description: string | null; visibility: string; viewport: BoardViewport; updatedAt: string } | null;
  width: number;
  height: number;
  items: BoardItem[];
  threads: BoardThread[];
};

export const BOARD_WIDTH = 1800;
export const BOARD_HEIGHT = 1400;

export const PAPER_COLORS = [
  { id: "cream", label: "크림", value: "#fff8e8" },
  { id: "butter", label: "버터", value: "#fff0b7" },
  { id: "sky", label: "하늘", value: "#dfeef4" },
  { id: "strawberry", label: "딸기", value: "#f2d2ce" },
  { id: "leaf", label: "잎사귀", value: "#e1ead9" },
  { id: "lavender", label: "연보라", value: "#e8e0ee" },
  { id: "rose", label: "장미", value: "#f7dcd7" },
] as const;

export const THREAD_COLORS = [
  { id: "warm-brown", label: "따뜻한 갈색", value: "#8b684d" },
  { id: "cream", label: "크림", value: "#d8c5a5" },
  { id: "strawberry", label: "말린 딸기", value: "#a56f68" },
  { id: "sky", label: "하늘", value: "#7099ad" },
  { id: "leaf", label: "잎사귀", value: "#879878" },
  { id: "lavender", label: "연보라", value: "#8e7da3" },
  { id: "dark-brown", label: "짙은 갈색", value: "#604433" },
] as const;

export function primaryAsset(memory: BoardMemory | null): BoardAssetVariant | undefined {
  if (!memory) return undefined;
  if (memory.type === "photo") return memory.assets.find((asset) => asset.role === "preview") ?? memory.assets.find((asset) => asset.role === "thumbnail");
  if (memory.type === "video" || memory.type === "manual_video") return memory.assets.find((asset) => asset.role === "poster") ?? memory.assets.find((asset) => asset.role === "thumbnail");
  return memory.assets.find((asset) => asset.role === "preview");
}

export function boardAssetUrl(id: string): string { return `/api/board/assets/${id}/content`; }
export function memoryAssetUrl(id: string): string { return `/api/media/${id}/content`; }

export function itemAssetUrl(item: BoardItem, overrides: Record<string, string> = {}): string | undefined {
  if (item.assetId) return overrides[item.assetId] ?? boardAssetUrl(item.assetId);
  const asset = primaryAsset(item.memory ?? item.group?.representative ?? null);
  return asset ? overrides[asset.id] ?? memoryAssetUrl(asset.id) : undefined;
}

export function paperLabel(item: BoardItem): string {
  if (item.elementType === "note" || item.elementType === "label") return item.textContent ?? "메모";
  if (item.elementType === "sticker") return `${item.styleJson.sticker ?? "장식"} 스티커`;
  if (item.elementType === "image") return item.asset?.originalFilename ?? "사진";
  if (item.elementType === "bundle") return `${item.group?.name ?? "추억"} 번들`;
  return item.memory?.title ?? "추억";
}

export function shortPaperLabel(item: BoardItem): string {
  let label: string;
  if (item.elementType === "note" || item.elementType === "label") label = (item.textContent ?? "메모").replace(/\s+/gu, " ");
  else if (item.elementType === "sticker") label = `${item.styleJson.sticker ?? "장식"} 스티커`;
  else if (item.elementType === "image") label = item.memory?.title ?? item.asset?.originalFilename ?? "붙인 사진";
  else if (item.elementType === "bundle") label = `${item.group?.name ?? "추억"} 번들`;
  else label = item.memory?.title ?? "추억";

  const characters = Array.from(label.trim());
  return characters.length > 18 ? `${characters.slice(0, 17).join("")}…` : characters.join("");
}
