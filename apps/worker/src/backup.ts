import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getBackupR2 } from "@is2u/core/r2";
import { getServerEnv } from "@is2u/core/env";

function runPgDump(output: string): Promise<void> {
  const env = getServerEnv();
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output, env.DATABASE_URL], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${code}): ${stderr.slice(-500)}`)));
  });
}

function encrypt(data: Buffer, passphrase: string): Buffer {
  const key = createHash("sha256").update(passphrase).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from("IS2U1"), iv, cipher.getAuthTag(), encrypted]);
}

async function pruneBackups(prefix: string, keep: number): Promise<void> {
  const env = getServerEnv();
  const r2 = getBackupR2();
  const objects: { Key: string; lastModified: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await r2.send(new ListObjectsV2Command({
      Bucket: env.R2_BACKUP_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) {
      if (object.Key) objects.push({ Key: object.Key, lastModified: object.LastModified?.getTime() ?? 0 });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  const expired = objects.sort((a, b) => b.lastModified - a.lastModified).slice(keep);
  for (let offset = 0; offset < expired.length; offset += 1000) {
    await r2.send(new DeleteObjectsCommand({
      Bucket: env.R2_BACKUP_BUCKET,
      Delete: { Objects: expired.slice(offset, offset + 1000).map(({ Key }) => ({ Key })), Quiet: true },
    }));
  }
}

export async function backupDatabase(): Promise<void> {
  const env = getServerEnv();
  const dir = await mkdtemp(join(tmpdir(), "is2u-backup-"));
  const dump = join(dir, "database.dump");
  try {
    await runPgDump(dump);
    const encrypted = encrypt(gzipSync(await readFile(dump), { level: 9 }), env.BACKUP_ENCRYPTION_KEY);
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const keys = [`postgres/daily/${date}/${timestamp}.dump.gz.enc`];
    if (now.getUTCDate() === 1) keys.push(`postgres/monthly/${date.slice(0, 7)}/${timestamp}.dump.gz.enc`);
    await Promise.all(keys.map((Key) => getBackupR2().send(new PutObjectCommand({ Bucket: env.R2_BACKUP_BUCKET, Key, Body: encrypted, ContentType: "application/octet-stream" }))));
    await Promise.all([pruneBackups("postgres/daily/", 30), pruneBackups("postgres/monthly/", 12)]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
