import { getBoss, QUEUES } from "../../web/lib/queue";
import { processMedia } from "./media-processing";
import { deliverMission } from "./delivery";
import { runHousekeeping } from "./housekeeping";
import { backupDatabase } from "./backup";

const boss = await getBoss();

await boss.work<{ missionId: string }>(QUEUES.deliverMission, { batchSize: 1, localConcurrency: 1 }, async ([job]) => {
  await deliverMission(job.data.missionId);
});

await boss.work<{ processingJobId: string; assetId: string }>(QUEUES.processMedia, { batchSize: 1, localConcurrency: 1 }, async ([job]) => {
  await processMedia(job.data.processingJobId, job.data.assetId);
});

await boss.work(QUEUES.housekeeping, { batchSize: 1, localConcurrency: 1 }, async () => {
  await runHousekeeping();
});

await boss.work(QUEUES.backup, { batchSize: 1, localConcurrency: 1 }, async () => {
  await backupDatabase();
});

await boss.schedule(QUEUES.housekeeping, "*/10 * * * *");
await boss.schedule(QUEUES.backup, "30 18 * * *");

console.log("is2u_worker_ready");

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

