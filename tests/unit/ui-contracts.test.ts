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

  it("self-hosts every supplied MaruBuri weight", async () => {
    const layout = await readFile("apps/web/app/layout.tsx", "utf8");
    for (const name of ["ExtraLight", "Light", "Regular", "SemiBold", "Bold"]) {
      const filename = `MaruBuri-${name}.ttf`;
      await access(`fonts/${filename}`);
      expect(layout).toContain(filename);
    }
    for (const variable of ["--font-maru-logo", "--font-maru-title", "--font-maru-body", "--font-maru-note"]) expect(layout).toContain(variable);
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
