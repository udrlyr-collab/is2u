import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("calendar save safety", () => {
  it("does not reset a form through a post-await DOM event reference", async () => {
    const source = await readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8");
    expect(source).not.toContain(".reset(");
    expect(source).toContain("setDraft(emptyDraft())");
    expect(source.indexOf("setDraft(emptyDraft())")).toBeGreaterThan(source.indexOf("await apiFetch"));
  });

  it("uses a stable client request id and a database unique index", async () => {
    const [clientSource, routeSource, migration] = await Promise.all([
      readFile("apps/web/app/(private)/calendar/calendar-view.tsx", "utf8"),
      readFile("apps/web/app/api/date-events/route.ts", "utf8"),
      readFile("packages/db/migrations/0002_flimsy_switch.sql", "utf8"),
    ]);
    expect(clientSource).toContain("clientRequestId");
    expect(routeSource).toContain("onConflictDoNothing");
    expect(migration).toContain('CREATE UNIQUE INDEX "date_events_client_request_uidx"');
  });
});
