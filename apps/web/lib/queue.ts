import { PgBoss } from "pg-boss";
import { getServerEnv } from "@is2u/core/env";

export const QUEUES = {
  deliverMission: "deliver-mission",
  processMedia: "process-media",
  housekeeping: "housekeeping",
  backup: "backup-database",
} as const;

let bossPromise: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  bossPromise ??= (async () => {
    const boss = new PgBoss({ connectionString: getServerEnv().DATABASE_URL, schema: "pgboss" });
    boss.on("error", (error) => console.error("pgboss_error", error.message));
    await boss.start();
    await Promise.all([
      boss.createQueue(QUEUES.deliverMission, { retryLimit: 2, retryDelay: 60, expireInSeconds: 120 }),
      boss.createQueue(QUEUES.processMedia, { retryLimit: 3, retryDelay: 120, expireInSeconds: 7200 }),
      boss.createQueue(QUEUES.housekeeping, { retryLimit: 1, expireInSeconds: 600 }),
      boss.createQueue(QUEUES.backup, { retryLimit: 2, retryDelay: 300, expireInSeconds: 3600 }),
    ]);
    return boss;
  })();
  return bossPromise;
}

