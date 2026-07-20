import { BOARD_HEIGHT, BOARD_WIDTH, type BoardItem, type BoardThread } from "./board-types";

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function itemCenter(item: BoardItem) {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

export function hangingPoint(thread: BoardThread, t: number) {
  const controlX = (thread.startX + thread.endX) / 2;
  const controlY = (thread.startY + thread.endY) / 2 + thread.curve;
  const x = (1 - t) ** 2 * thread.startX + 2 * (1 - t) * t * controlX + t ** 2 * thread.endX;
  const y = (1 - t) ** 2 * thread.startY + 2 * (1 - t) * t * controlY + t ** 2 * thread.endY;
  const dx = 2 * (1 - t) * (controlX - thread.startX) + 2 * t * (thread.endX - controlX);
  const dy = 2 * (1 - t) * (controlY - thread.startY) + 2 * t * (thread.endY - controlY);
  return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

export function hangingLayout(thread: BoardThread, itemMap: Map<string, BoardItem>) {
  return thread.itemIds.flatMap((id, index) => {
    const item = itemMap.get(id);
    if (!item) return [];
    const point = hangingPoint(thread, (index + 1) / (thread.itemIds.length + 1));
    return [{
      ...item,
      x: Math.round(clamp(point.x - item.width / 2, 0, BOARD_WIDTH - item.width)),
      y: Math.round(clamp(point.y + 28, 0, BOARD_HEIGHT - item.height)),
      rotationTenths: Math.round(clamp(point.angle * 4, -60, 60)),
      styleJson: { ...item.styleJson, attachment: "clip" },
    }];
  });
}

export function hangingPath(thread: BoardThread) {
  return `M ${thread.startX} ${thread.startY} Q ${(thread.startX + thread.endX) / 2} ${(thread.startY + thread.endY) / 2 + thread.curve} ${thread.endX} ${thread.endY}`;
}

export function linkingPaths(thread: BoardThread, itemMap: Map<string, BoardItem>) {
  const members = thread.itemIds.map((id) => itemMap.get(id)).filter((item): item is BoardItem => Boolean(item));
  return members.slice(0, -1).map((item, index) => {
    const from = itemCenter(item);
    const to = itemCenter(members[index + 1]);
    const bend = Math.max(-60, Math.min(60, thread.curve / 3));
    return `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + bend} ${to.x} ${to.y}`;
  });
}

export function boundedGroupDelta(items: BoardItem[], requestedDx: number, requestedDy: number) {
  if (!items.length) return { dx: 0, dy: 0 };
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return {
    dx: clamp(requestedDx, -minX, BOARD_WIDTH - maxX),
    dy: clamp(requestedDy, -minY, BOARD_HEIGHT - maxY),
  };
}
