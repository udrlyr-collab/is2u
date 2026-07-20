import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { coupleMissionIntervalSchema } from "@is2u/core/validation";

describe("recurring scheduled missions", () => {
  it("validates the shared 10 to 240 minute interval contract", () => {
    expect(coupleMissionIntervalSchema.parse({ minMinutes: 10, maxMinutes: 240 })).toEqual({ minMinutes: 10, maxMinutes: 240 });
    expect(() => coupleMissionIntervalSchema.parse({ minMinutes: 9, maxMinutes: 40 })).toThrow();
    expect(() => coupleMissionIntervalSchema.parse({ minMinutes: 70, maxMinutes: 30 })).toThrow("최소 간격은 최대 간격보다 작거나 같아야 해요");
  });

  it("persists one schedule per date and protects every dispatch with unique keys", async () => {
    const [schema, migration, worker] = await Promise.all([
      readFile("packages/db/src/schema.ts", "utf8"),
      readFile("packages/db/migrations/0014_unusual_dreaming_celestial.sql", "utf8"),
      readFile("apps/worker/src/mission-scheduler.ts", "utf8"),
    ]);
    expect(schema).toContain('pgTable("date_mission_schedules"');
    expect(migration).toContain('CREATE UNIQUE INDEX "date_mission_schedules_event_uidx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "missions_schedule_dispatch_uidx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "missions_notification_key_uidx"');
    expect(worker).toContain("for update");
    expect(worker).toContain("onConflictDoNothing({ target: missions.scheduleDispatchKey })");
  });

  it("uses a one-minute worker cycle and excludes test and manual sources from operational counts", async () => {
    const [workerIndex, worker, scheduler] = await Promise.all([
      readFile("apps/worker/src/index.ts", "utf8"),
      readFile("apps/worker/src/mission-scheduler.ts", "utf8"),
      readFile("apps/web/lib/scheduler.ts", "utf8"),
    ]);
    expect(workerIndex).toContain('boss.schedule(QUEUES.missionScheduleScan, "* * * * *")');
    expect(scheduler).toContain('["scheduled_random", "automatic"]');
    expect(worker).toContain('source: "scheduled_random"');
    expect(worker).not.toContain('source, "manual_random"');
    expect(worker).not.toContain("weeklyMissionLimit");
  });

  it("cancels persistent schedules on dates, connections and deleted accounts", async () => {
    const sources = await Promise.all([
      readFile("apps/web/lib/scheduler.ts", "utf8"),
      readFile("apps/web/app/api/couple/disconnect/route.ts", "utf8"),
      readFile("apps/web/app/api/admin/couples/[id]/route.ts", "utf8"),
      readFile("apps/web/app/api/admin/users/[id]/route.ts", "utf8"),
    ]);
    for (const source of sources) expect(source).toContain("dateMissionSchedules");
    expect(sources[0]).toContain('status: "cancelled"');
  });
});
