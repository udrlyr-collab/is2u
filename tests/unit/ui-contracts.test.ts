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

  it("ships the post-it icon set without the removed paper-sound assets", async () => {
    for (const path of [
      "apps/web/public/favicon.ico",
      "apps/web/public/icons/apple-touch-icon.png",
      "apps/web/public/icons/icon-192.png",
      "apps/web/public/icons/icon-512.png",
      "apps/web/public/icons/icon-maskable-512.png",
    ]) await access(path);
    await expect(access("apps/web/components/paper-sound-provider.tsx")).rejects.toThrow();
    await expect(access("apps/web/public/sounds/paper-tap.mp3")).rejects.toThrow();
    const manifest = await readFile("apps/web/public/manifest.webmanifest", "utf8");
    expect(manifest).toContain('"purpose": "maskable"');
    expect(manifest).toContain('"name": "추억"');
  });

  it("checks notification permission and removes the hidden multi-tap test entry", async () => {
    const [settings, header] = await Promise.all([
      readFile("apps/web/app/(private)/settings/settings-panel.tsx", "utf8"),
      readFile("apps/web/app/(private)/site-header.tsx", "utf8"),
    ]);
    expect(settings).toContain("Notification.permission");
    expect(settings).toContain("getSubscription()");
    expect(settings).toContain("알림 도움말");
    expect(settings).toContain("iPhone · Safari");
    expect(settings).toContain("Android · Chrome");
    expect(settings).toContain("홈 화면에 추가");
    expect(settings).not.toContain("secretTaps");
    expect(settings).not.toContain("tapVersion");
    expect(header).toContain('href: "/admin"');
    expect(header).toContain("isAdmin");
  });

  it("removes the legacy PIN claim entry and keeps account usernames immutable", async () => {
    const [login, accountPanel, profileEditor, accountRoute, validation] = await Promise.all([
      readFile("apps/web/app/(auth)/login/login-form.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/account-panel.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/profile/profile-editor.tsx", "utf8"),
      readFile("apps/web/app/api/account/route.ts", "utf8"),
      readFile("packages/core/src/validation.ts", "utf8"),
    ]);
    expect(login).not.toContain("/legacy");
    expect(login).not.toContain("기존 PIN");
    await expect(access("apps/web/app/(auth)/legacy/page.tsx")).rejects.toThrow();
    await expect(access("apps/web/app/api/auth/legacy-claim/route.ts")).rejects.toThrow();
    expect(accountPanel).toContain("@{account.username}");
    expect(accountPanel).not.toContain("<Input");
    expect(profileEditor).toContain("@{account.username}");
    expect(profileEditor).not.toContain("아이디는 가입한 뒤 바꿀 수 없어요");
    expect(accountRoute).not.toContain("username: input.username");
    expect(validation).not.toContain("legacyClaimSchema");
  });

  it("separates profile and connection management from the settings summary", async () => {
    const [account, connectionSummary, connectionManager, settings, styles] = await Promise.all([
      readFile("apps/web/app/(private)/settings/account-panel.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/connection-panel.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/connection/connection-manager.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/settings-note.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    expect(account).toContain('href="/settings/profile"');
    expect(connectionSummary).toContain('href="/settings/connection"');
    expect(connectionSummary).not.toContain("함께 쓰는 공간 정리");
    expect(connectionSummary).not.toContain("연결 정리");
    expect(connectionManager).toContain("정말 연결을 정리할까요");
    expect(connectionManager).toContain("현재 비밀번호");
    expect(connectionManager).toContain("연결을 정리할게요");
    expect(connectionManager).toContain("함께 남긴 추억과 약속은 그대로 보관돼요");
    expect(settings).toContain("settings-note-card");
    expect(styles).toContain(".settings-note-card");
  });

  it("adds administrator soft deletion and reasoned connection cleanup without exposing deleted actions", async () => {
    const [admin, userRoute, coupleRoute, disconnectRoute, schema, migration] = await Promise.all([
      readFile("apps/web/app/(private)/admin/admin-dashboard.tsx", "utf8"),
      readFile("apps/web/app/api/admin/users/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/admin/couples/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/couple/disconnect/route.ts", "utf8"),
      readFile("packages/db/src/schema.ts", "utf8"),
      readFile("packages/db/migrations/0013_open_paibok.sql", "utf8"),
    ]);
    expect(admin).toContain("계정 삭제하기");
    expect(admin).toContain("deleted &&");
    expect(admin).toContain("처리 사유");
    expect(userRoute).toContain('accountStatus: "deleted"');
    expect(userRoute).toContain("invalidatedAt: now");
    expect(userRoute).not.toContain("delete(users)");
    expect(coupleRoute).toContain("initiatedByAdminId");
    expect(disconnectRoute).toContain("initiatedByUserId");
    expect(disconnectRoute).toContain("RATE_LIMIT_ATTEMPTS");
    expect(schema).toContain('deletedAt: timestamp("deleted_at"');
    expect(migration).toContain("initiated_by_admin_id");
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
    const [header, home, detail, picker] = await Promise.all([
      readFile("apps/web/app/(private)/site-header.tsx", "utf8"),
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/(private)/missions/[id]/mission-view.tsx", "utf8"),
      readFile("apps/web/components/categorized-choice-picker.tsx", "utf8"),
    ]);
    expect(header).toContain('label: "추억"');
    expect(header).not.toContain('label: "순간"');
    expect(home).toContain("우리의 추억");
    expect(detail).not.toContain("최근에 붙인 마음");
    expect(picker).toContain('aria-checked={selected}');
    expect(detail).toContain("수정 내용 저장하기");
    expect(detail).toContain("추억 떼기");
  });

  it("provides buttonless context menus, long press, keyboard access, state-specific actions and soft delete", async () => {
    const [board, styles, missionRoute, schema, migration] = await Promise.all([
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
      readFile("apps/web/app/api/missions/[id]/route.ts", "utf8"),
      readFile("packages/db/src/schema.ts", "utf8"),
      readFile("packages/db/migrations/0008_powerful_ezekiel.sql", "utf8"),
    ]);
    expect(board).toContain("onContextMenu");
    expect(board).toContain("startLongPress");
    expect(board).not.toContain("memory-menu-button");
    expect(board).not.toContain(">···<");
    expect(board).toContain("tabIndex={0}");
    expect(board).toContain('event.key === "ContextMenu"');
    expect(board).toContain('event.shiftKey && event.key === "F10"');
    expect(board).toContain('event.key === "ArrowDown"');
    expect(board).toContain("}, 520)");
    expect(board).toContain("> 10");
    expect(board).toContain("suppressClickUntil");
    expect(board).toContain("window.localStorage.setItem");
    expect(board).toContain('role="menu"');
    expect(board).toContain("미션 취소");
    expect(board).toContain("수정하기");
    expect(board).toContain("추억 떼기");
    expect(styles).not.toContain(".mission-slip::after");
    expect(styles).not.toContain(".mission-slip::before");
    expect(missionRoute).toContain("canRemoveMissionFromTimeline");
    expect(missionRoute).toContain("mission.soft_deleted");
    expect(schema).toContain('deletedAt: timestamp("deleted_at"');
    expect(migration).toContain('ALTER TABLE "missions" ADD COLUMN "deleted_at"');
  });

  it("edits text, event links, and Seoul pinned time while preserving created time across replacements", async () => {
    const [manualDetail, missionDetail, editRoute, replacement, missionComplete, finalize] = await Promise.all([
      readFile("apps/web/app/(private)/memories/[id]/memory-detail-view.tsx", "utf8"),
      readFile("apps/web/app/(private)/missions/[id]/mission-view.tsx", "utf8"),
      readFile("apps/web/app/api/memories/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/memories/[id]/replacement/route.ts", "utf8"),
      readFile("apps/web/app/api/missions/[id]/complete/route.ts", "utf8"),
      readFile("apps/web/app/api/memories/[id]/finalize-replacement/route.ts", "utf8"),
    ]);
    for (const source of [manualDetail, missionDetail]) {
      expect(source).toContain("수정 내용 저장하기");
      expect(source).toContain("연결할 약속");
      expect(source).toContain("날짜와 시간");
      expect(source).toContain("parseSeoulDateTimeInput");
      expect(source).toContain("toSeoulDateTimeInput");
      expect(source).toContain("memory.createdAt");
      expect(source).toContain("firstPinnedAtChanged");
      expect(source).toContain("firstPinnedAtChanged ? { firstPinnedAt:");
      expect(source).toContain("finalize-replacement");
    }
    expect(manualDetail).toContain("FilePicker");
    expect(manualDetail).toContain("AudioPicker");
    expect(editRoute).toContain("firstPinnedAt: input.firstPinnedAt === undefined ? current.firstPinnedAt : input.firstPinnedAt");
    expect(replacement).toContain("createdAt: current.createdAt");
    expect(replacement).toContain("firstPinnedAt: input.firstPinnedAt === undefined ? current.firstPinnedAt : input.firstPinnedAt");
    expect(missionComplete).toContain("createdAt: replacing ? existing!.createdAt : now");
    expect(missionComplete).toContain("firstPinnedAt: replacing ? input.firstPinnedAt ?? existing!.firstPinnedAt : now");
    expect(finalize).toContain("pendingReplacement: false");
    expect(finalize).toContain("deletedAt: now, purgeAfter");
  });

  it("uses categorized choice tabs and stable-width mobile layout without 100vw", async () => {
    const [picker, styles] = await Promise.all([
      readFile("apps/web/components/categorized-choice-picker.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
    ]);
    expect(picker).toContain('role="tablist"');
    expect(picker).toContain('role="radiogroup"');
    expect(picker).toContain("emotion-selection-summary");
    expect(styles).toContain("scrollbar-gutter: stable");
    expect(styles).toContain("overflow-x: clip");
    expect(styles).not.toContain("100vw");
    expect(styles).toContain("left: 1rem; width: auto");
  });

  it("uses one outer page shell and header for memories and appointments", async () => {
    const [homePage, calendarPage, home, calendar, shell, styles, tokens] = await Promise.all([
      readFile("apps/web/app/(private)/home/page.tsx", "utf8"),
      readFile("apps/web/app/(private)/calendar/page.tsx", "utf8"),
      readFile("apps/web/app/(private)/home/mission-board.tsx", "utf8"),
      readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8"),
      readFile("apps/web/components/page-shell.tsx", "utf8"),
      readFile("apps/web/app/globals.css", "utf8"),
      readFile("apps/web/app/design-tokens.css", "utf8"),
    ]);
    expect(homePage).toContain("<PageShell>");
    expect(calendarPage).toContain("<PageShell>");
    expect(home).toContain('<PageHeader label="OUR LITTLE MEMORIES"');
    expect(calendar).toContain('<PageHeader label="DATE NOTES"');
    expect(shell).toContain('className="page-header"');
    expect(tokens).toContain("--page-max-width: 78rem");
    expect(tokens).toContain("--page-padding-inline:");
    expect(styles).not.toContain(".home-page {");
    expect(styles).not.toContain(".calendar-page {");
  });

  it("publishes a reusable public design system with exact tokens and a downloadable starter kit", async () => {
    const [page, kit, copy, styles, tokens] = await Promise.all([
      readFile("apps/web/app/design/page.tsx", "utf8"),
      readFile("apps/web/app/design/design-kit.ts", "utf8"),
      readFile("apps/web/app/design/copy-code.tsx", "utf8"),
      readFile("apps/web/app/design/design.css", "utf8"),
      readFile("apps/web/app/design-tokens.css", "utf8"),
    ]);
    for (const section of ["principles", "colors", "type", "materials", "components", "layout", "motion", "voice", "accessibility", "starter"]) {
      expect(page).toContain(`id="${section}"`);
    }
    expect(page).toContain("IS2U DESIGN SYSTEM");
    expect(page).toContain("하지 않는 것");
    expect(page).toContain("MaruBuri");
    expect(page).not.toContain("requireSession");
    for (const token of ["--background: #fbf7f1", "--strawberry: #d9827a", "--paper-shadow: 2px 3px 0", "--page-max-width: 78rem"]) {
      expect(kit).toContain(token);
      expect(tokens).toContain(token);
    }
    expect(copy).toContain("navigator.clipboard.writeText");
    expect(copy).toContain('anchor.download = "is2u-design-kit.css"');
    expect(styles).toContain("@media (max-width: 620px)");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("prefers-reduced-motion");
  });

  it("adds one hand-drawn strawberry heart to the retained post-it icon", async () => {
    const [icon, maskable] = await Promise.all([
      readFile("apps/web/public/icon.svg", "utf8"),
      readFile("apps/web/public/icon-maskable.svg", "utf8"),
    ]);
    expect(icon).toContain('fill="none" stroke="#d9827a"');
    expect(maskable).toContain('fill="none" stroke="#d9827a"');
  });

  it("moves the five-section mission test menu into the role-protected administrator area", async () => {
    const [panel, route] = await Promise.all([
      readFile("apps/web/app/(private)/admin/admin-test-panel.tsx", "utf8"),
      readFile("apps/web/app/api/admin/tests/route.ts", "utf8"),
    ]);
    expect(panel).toContain('useState("random")');
    expect(panel).toContain('setTemplateId("random")');
    expect(panel).toContain('aria-checked={category === item.id}');
    expect(route).toContain("TEST_MISSION_CATEGORIES");
    expect(route).toContain("chooseTestMissionTemplate");
    expect(route).toContain("requireAdmin");
    expect(route).toContain('source: "admin_test"');
    expect(route).not.toContain("MISSION_TYPES");
    for (const category of ["video", "photo", "text", "audio", "emotion"]) expect(panel).toContain(`id: "${category}"`);
  });

  it("keeps the appointment view in the URL and shows year and full occurrence position", async () => {
    const calendar = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(calendar).toContain('searchParams.get("view")');
    expect(calendar).toContain('params.set("view", view)');
    expect(calendar).toContain('year: "numeric"');
    expect(calendar).toContain("1일차 · ${occurrence.dayCount}일 약속");
  });

  it("removes paper-sound and visible install controls while keeping notification settings", async () => {
    const [layout, settings] = await Promise.all([
      readFile("apps/web/app/layout.tsx", "utf8"),
      readFile("apps/web/app/(private)/settings/settings-panel.tsx", "utf8"),
    ]);
    expect(layout).not.toContain("PaperSoundProvider");
    expect(settings).not.toContain("종이 소리");
    expect(settings).not.toContain("앱으로 설치");
    expect(settings).not.toContain("private");
    expect(settings).toContain("NEXT_PUBLIC_APP_VERSION");
    expect(settings).toContain("알림");
  });

  it("provides context menu, long press and a visible menu button for appointments", async () => {
    const calendar = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(calendar).toContain("onContextMenu");
    expect(calendar).toContain("startLongPress");
    expect(calendar).toContain("appointment-menu-button");
    expect(calendar).toContain('role="menu"');
  });
});
