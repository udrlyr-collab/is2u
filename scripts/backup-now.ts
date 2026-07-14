import { backupDatabase } from "../apps/worker/src/backup";

await backupDatabase();
console.log("BACKUP_OK");
