import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("redesign data contracts", () => {
  it("keeps cancellation and deletion as separate date-event actions", async () => {
    const [listRoute, detailRoute, cancelRoute] = await Promise.all([
      readFile("apps/web/app/api/date-events/route.ts", "utf8"),
      readFile("apps/web/app/api/date-events/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/date-events/[id]/cancel/route.ts", "utf8"),
    ]);
    expect(listRoute).toContain("isNull(dateEvents.deletedAt)");
    expect(detailRoute).toContain("deletedAt: new Date()");
    expect(cancelRoute).toContain('status: "cancelled"');
  });

  it("includes test missions in the shared home mission feed", async () => {
    const source = await readFile("apps/web/app/api/missions/route.ts", "utf8");
    expect(source).toContain("isTest: mission.isTest");
    expect(source).not.toContain("eq(missions.isTest, false)");
  });

  it("self-hosts and applies all four supplied local fonts", async () => {
    const layout = await readFile("apps/web/app/layout.tsx", "utf8");
    for (const filename of ["KMU80TTFHaeongSans.ttf", "KMU80TTFHaeongSemiSans.ttf", "KMU80TTFSungkokSemiSerif.ttf", "KMU80TTFSungkokSerif.ttf"]) {
      await access(`fonts/${filename}`);
      expect(layout).toContain(filename);
    }
    for (const variable of ["--font-maru-logo", "--font-maru-title", "--font-maru-body", "--font-maru-note"]) expect(layout).toContain(variable);
  });

  it("uses one timeline, camera and gallery choices, and no manual archive UI", async () => {
    const [board, detail] = await Promise.all([
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/(private)/missions/[id]/mission-view.tsx", "utf8"),
    ]);
    expect(board).toContain("unified-timeline");
    expect(board).not.toContain("orderedRecipients");
    expect(detail).toContain("지금 찍기");
    expect(detail).toContain('{label}에서 고르기');
    expect(detail).toContain('const label = kind === "photo" ? "사진" : "영상"');
    expect(detail).not.toContain("ORIGINAL ARCHIVE");
    expect(detail).not.toContain("원본 추가 보관");
    await expect(access("apps/web/app/api/memories/manual/route.ts")).rejects.toThrow();
  });

  it("ships the post-it icon set and six local paper sounds", async () => {
    for (const path of [
      "apps/web/public/favicon.ico",
      "apps/web/public/icons/apple-touch-icon.png",
      "apps/web/public/icons/icon-192.png",
      "apps/web/public/icons/icon-512.png",
      "apps/web/public/icons/icon-maskable-512.png",
      "apps/web/public/sounds/paper-tap.mp3",
      "apps/web/public/sounds/note-stick.mp3",
      "apps/web/public/sounds/page-open.mp3",
      "apps/web/public/sounds/note-peel.mp3",
      "apps/web/public/sounds/save-soft.mp3",
      "apps/web/public/sounds/close-paper.mp3",
    ]) await access(path);
    const manifest = await readFile("apps/web/public/manifest.webmanifest", "utf8");
    expect(manifest).toContain('"purpose": "maskable"');
  });

  it("checks notification permission and subscription and unlocks test mode in three taps", async () => {
    const settings = await readFile("apps/web/app/(private)/settings/settings-panel.tsx", "utf8");
    expect(settings).toContain("Notification.permission");
    expect(settings).toContain("getSubscription()");
    expect(settings).toContain("next >= 3");
    expect(settings).not.toContain("next >= 7");
  });

  it("enforces completed-memory ownership on the delete route", async () => {
    const route = await readFile("apps/web/app/api/memories/[id]/route.ts", "utf8");
    expect(route).toContain("eq(memories.createdBy, session.user.id)");
  });

  it("opens completed missions with preview media and keeps originals on a separate download path", async () => {
    const [feed, detail, original, styles] = await Promise.all([
      readFile("apps/web/app/api/missions/route.ts", "utf8"),
      readFile("apps/web/app/(private)/missions/[id]/mission-view.tsx", "utf8"),
      readFile("apps/web/app/api/memories/[id]/original/route.ts", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    expect(feed).toContain('mission.status === "completed"');
    expect(detail).toContain("playsInline");
    expect(detail).toContain('preload="none"');
    expect(styles).toContain("object-fit: contain");
    expect(original).toContain('eq(mediaAssets.role, "original")');
  });

  it("provides context menu, long press and a visible menu button for appointments", async () => {
    const calendar = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(calendar).toContain("onContextMenu");
    expect(calendar).toContain("startLongPress");
    expect(calendar).toContain("appointment-menu-button");
    expect(calendar).toContain('role="menu"');
  });
});
