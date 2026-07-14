import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@is2u/db/client";
import { mediaAssets, processingJobs } from "@is2u/db/schema";
import { getServerEnv } from "@is2u/core/env";
import { getMediaR2 } from "@is2u/core/r2";

type Probe = { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number }> };

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stderr.slice(-500)}`)));
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), async function* (source) {
    for await (const chunk of source) { hash.update(chunk); yield chunk; }
  }, createWriteStream(process.platform === "win32" ? "NUL" : "/dev/null"));
  return hash.digest("hex");
}

async function uploadDerived(path: string, key: string, contentType: string): Promise<number> {
  const env = getServerEnv();
  const info = await stat(path);
  await getMediaR2().send(new PutObjectCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, Body: createReadStream(path), ContentType: contentType, CacheControl: "public, max-age=31536000, immutable", ContentLength: info.size }));
  return info.size;
}

async function downloadOriginal(key: string, path: string): Promise<void> {
  const env = getServerEnv();
  const result = await getMediaR2().send(new GetObjectCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key }));
  if (!result.Body) throw new Error("R2 original body is empty");
  const stream = result.Body as unknown as Readable;
  await pipeline(stream, createWriteStream(path));
}

async function processImage(asset: typeof mediaAssets.$inferSelect, input: string, workDir: string) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error("Invalid image signature");
  const previewPath = join(workDir, "preview.webp");
  const thumbnailPath = join(workDir, "thumbnail.webp");
  await sharp(input).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(previewPath);
  await sharp(input).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toFile(thumbnailPath);
  const prefix = `${asset.memoryId}/${asset.id}`;
  const previewKey = `previews/${prefix}/v1.webp`;
  const thumbnailKey = `thumbnails/${prefix}/v1.webp`;
  const [previewSize, thumbnailSize] = await Promise.all([
    uploadDerived(previewPath, previewKey, "image/webp"),
    uploadDerived(thumbnailPath, thumbnailKey, "image/webp"),
  ]);
  return [
    { id: randomUUID(), memoryId: asset.memoryId, parentAssetId: asset.id, role: "preview" as const, storageKey: previewKey, mimeType: "image/webp", fileSize: previewSize, width: Math.min(metadata.width, 1600), height: Math.min(metadata.height, 1600), processingStatus: "ready" as const },
    { id: randomUUID(), memoryId: asset.memoryId, parentAssetId: asset.id, role: "thumbnail" as const, storageKey: thumbnailKey, mimeType: "image/webp", fileSize: thumbnailSize, width: Math.min(metadata.width, 480), height: Math.min(metadata.height, 480), processingStatus: "ready" as const },
  ];
}

async function probeMedia(input: string): Promise<{ durationMs: number; width?: number; height?: number; hasVideo: boolean; hasAudio: boolean }> {
  const output = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", input]);
  const probe = JSON.parse(output) as Probe;
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  return { durationMs: Math.max(0, Math.round(Number(probe.format?.duration ?? 0) * 1000)), width: video?.width, height: video?.height, hasVideo: Boolean(video), hasAudio: Boolean(audio) };
}

async function processVideo(asset: typeof mediaAssets.$inferSelect, input: string, workDir: string) {
  const probe = await probeMedia(input);
  if (!probe.hasVideo) throw new Error("Invalid video signature");
  const previewPath = join(workDir, "preview.mp4");
  const posterPath = join(workDir, "poster.webp");
  await run("ffmpeg", ["-y", "-threads", "1", "-i", input, "-map_metadata", "-1", "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30", "-c:v", "libx264", "-profile:v", "main", "-level", "3.1", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "25", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", previewPath]);
  await run("ffmpeg", ["-y", "-threads", "1", "-ss", String(Math.min(1, Math.max(0, probe.durationMs / 2000))), "-i", input, "-frames:v", "1", "-vf", "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", posterPath]);
  const prefix = `${asset.memoryId}/${asset.id}`;
  const previewKey = `previews/${prefix}/v1.mp4`;
  const posterKey = `posters/${prefix}/v1.webp`;
  const [previewSize, posterSize] = await Promise.all([
    uploadDerived(previewPath, previewKey, "video/mp4"),
    uploadDerived(posterPath, posterKey, "image/webp"),
  ]);
  return { probe, assets: [
    { id: randomUUID(), memoryId: asset.memoryId, parentAssetId: asset.id, role: "preview" as const, storageKey: previewKey, mimeType: "video/mp4", fileSize: previewSize, width: probe.width ? Math.min(probe.width, 1280) : null, height: probe.height ?? null, durationMs: probe.durationMs, processingStatus: "ready" as const },
    { id: randomUUID(), memoryId: asset.memoryId, parentAssetId: asset.id, role: "poster" as const, storageKey: posterKey, mimeType: "image/webp", fileSize: posterSize, processingStatus: "ready" as const },
  ] };
}

async function processAudio(asset: typeof mediaAssets.$inferSelect, input: string, workDir: string) {
  const probe = await probeMedia(input);
  if (!probe.hasAudio || probe.hasVideo) throw new Error("Invalid audio signature");
  const previewPath = join(workDir, `preview.${asset.storageKey.split(".").pop() ?? "bin"}`);
  await pipeline(createReadStream(input), createWriteStream(previewPath));
  const key = `previews/${asset.memoryId}/${asset.id}/v1.${asset.storageKey.split(".").pop() ?? "bin"}`;
  const size = await uploadDerived(previewPath, key, asset.mimeType);
  return { probe, assets: [{ id: randomUUID(), memoryId: asset.memoryId, parentAssetId: asset.id, role: "preview" as const, storageKey: key, mimeType: asset.mimeType, fileSize: size, durationMs: probe.durationMs, processingStatus: "ready" as const }] };
}

export async function processMedia(processingJobId: string, assetId: string): Promise<void> {
  const db = getDb();
  const [asset] = await db.select().from(mediaAssets).where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.role, "original"))).limit(1);
  if (!asset) throw new Error("Original asset not found");
  const workDir = await mkdtemp(join(tmpdir(), "is2u-media-"));
  const input = join(workDir, "original");
  try {
    await db.update(processingJobs).set({ status: "processing", attempts: (await db.select({ attempts: processingJobs.attempts }).from(processingJobs).where(eq(processingJobs.id, processingJobId)).limit(1))[0]?.attempts + 1 }).where(eq(processingJobs.id, processingJobId));
    await db.update(mediaAssets).set({ processingStatus: "processing" }).where(eq(mediaAssets.id, asset.id));
    await downloadOriginal(asset.storageKey, input);
    const checksum = await sha256File(input);
    let derived: Array<typeof mediaAssets.$inferInsert> = [];
    let dimensions: { width?: number; height?: number; durationMs?: number } = {};
    if (asset.mimeType.startsWith("image/")) derived = await processImage(asset, input, workDir);
    else if (asset.mimeType.startsWith("video/")) {
      const result = await processVideo(asset, input, workDir); derived = result.assets; dimensions = result.probe;
    } else if (asset.mimeType.startsWith("audio/")) {
      const result = await processAudio(asset, input, workDir); derived = result.assets; dimensions = result.probe;
    } else throw new Error("Unsupported media type");
    await db.transaction(async (tx) => {
      await tx.delete(mediaAssets).where(and(eq(mediaAssets.parentAssetId, asset.id), eq(mediaAssets.processingStatus, "ready")));
      if (derived.length) await tx.insert(mediaAssets).values(derived);
      await tx.update(mediaAssets).set({ checksumSha256: checksum, width: dimensions.width, height: dimensions.height, durationMs: dimensions.durationMs, processingStatus: "ready" }).where(eq(mediaAssets.id, asset.id));
      await tx.update(processingJobs).set({ status: "ready", errorSummary: null, finishedAt: new Date() }).where(eq(processingJobs.id, processingJobId));
    });
  } catch (error) {
    const summary = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "unknown processing error";
    await db.update(mediaAssets).set({ processingStatus: "failed" }).where(eq(mediaAssets.id, asset.id));
    await db.update(processingJobs).set({ status: "failed", errorSummary: summary }).where(eq(processingJobs.id, processingJobId));
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
