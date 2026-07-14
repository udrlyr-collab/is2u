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

  it("restores the original MaruBuri font system and disconnects the four KMU fonts", async () => {
    const layout = await readFile("apps/web/app/layout.tsx", "utf8");
    for (const filename of ["MaruBuri-Bold.ttf", "MaruBuri-SemiBold.ttf", "MaruBuri-Regular.ttf", "MaruBuri-ExtraLight.ttf", "MaruBuri-Light.ttf"]) {
      await access(`fonts/${filename}`);
      expect(layout).toContain(filename);
    }
    expect(layout).not.toContain("KMU80TTF");
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
    expect(manifest).toContain('"name": "추억"');
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

  it("uses the unified 추억 label, explicit edit/delete wording, and no recent emotion section", async () => {
    const [header, home, detail] = await Promise.all([
      readFile("apps/web/app/(private)/site-header.tsx", "utf8"),
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/(private)/missions/[id]/mission-view.tsx", "utf8"),
    ]);
    expect(header).toContain('label: "추억"');
    expect(header).not.toContain('label: "순간"');
    expect(home).toContain("우리의 추억");
    expect(detail).not.toContain("최근에 붙인 마음");
    expect(detail).toContain('aria-checked={selected}');
    expect(detail).toContain("수정 내용 저장하기");
    expect(detail).toContain("추억 떼기");
  });

  it("derives the three-section test menu from the shared active templates with random defaults", async () => {
    const [panel, route] = await Promise.all([
      readFile("apps/web/app/(private)/settings/mission-test-panel.tsx", "utf8"),
      readFile("apps/web/app/api/mission-test/route.ts", "utf8"),
    ]);
    expect(panel).toContain('useState("random")');
    expect(panel).toContain('setTemplateId("random")');
    expect(panel).toContain('aria-checked={category === item.id}');
    expect(route).toContain("TEST_MISSION_CATEGORIES");
    expect(route).toContain("chooseTestMissionTemplate");
    expect(route).not.toContain("MISSION_TYPES");
  });

  it("keeps the appointment view in the URL and shows year and full occurrence position", async () => {
    const calendar = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(calendar).toContain('searchParams.get("view")');
    expect(calendar).toContain('params.set("view", view)');
    expect(calendar).toContain('year: "numeric"');
    expect(calendar).toContain("1일차 · ${occurrence.dayCount}일 약속");
  });

  it("provides an audible paper-sound test and role-specific interaction names", async () => {
    const [provider, settings] = await Promise.all([
      readFile("apps/web/components/paper-sound-provider.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/settings-panel.tsx", "utf8"),
    ]);
    expect(provider).toContain('"page-close"');
    expect(provider).toContain('closest<HTMLElement>("[data-paper-sound]")');
    expect(settings).toContain("종이 소리 들어보기");
    expect(settings).toContain('play("paper-tap")');
  });

  it("provides context menu, long press and a visible menu button for appointments", async () => {
    const calendar = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(calendar).toContain("onContextMenu");
    expect(calendar).toContain("startLongPress");
    expect(calendar).toContain("appointment-menu-button");
    expect(calendar).toContain('role="menu"');
  });
});
