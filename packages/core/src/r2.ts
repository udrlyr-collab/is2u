import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "./env";

let mediaClient: S3Client | undefined;
let backupClient: S3Client | undefined;

function createClient(accessKeyId: string, secretAccessKey: string): S3Client {
  const env = getServerEnv();
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function getMediaR2(): S3Client {
  const env = getServerEnv();
  mediaClient ??= createClient(env.R2_MEDIA_ACCESS_KEY_ID, env.R2_MEDIA_SECRET_ACCESS_KEY);
  return mediaClient;
}

export function getBackupR2(): S3Client {
  const env = getServerEnv();
  backupClient ??= createClient(env.R2_BACKUP_ACCESS_KEY_ID, env.R2_BACKUP_SECRET_ACCESS_KEY);
  return backupClient;
}

export async function createSingleUpload(key: string, contentType: string): Promise<string> {
  const env = getServerEnv();
  return getSignedUrl(getMediaR2(), new PutObjectCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 900 });
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const env = getServerEnv();
  const result = await getMediaR2().send(new CreateMultipartUploadCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, ContentType: contentType }));
  if (!result.UploadId) throw new Error("R2 multipart upload ID가 없습니다.");
  return result.UploadId;
}

export async function signUploadPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  const env = getServerEnv();
  return getSignedUrl(getMediaR2(), new UploadPartCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 900 });
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  const env = getServerEnv();
  await getMediaR2().send(new CompleteMultipartUploadCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const env = getServerEnv();
  await getMediaR2().send(new AbortMultipartUploadCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key, UploadId: uploadId }));
}

export async function headMediaObject(key: string) {
  const env = getServerEnv();
  return getMediaR2().send(new HeadObjectCommand({ Bucket: env.R2_MEDIA_BUCKET, Key: key }));
}

export async function createOriginalDownload(key: string, filename: string): Promise<string> {
  const env = getServerEnv();
  return getSignedUrl(getMediaR2(), new GetObjectCommand({
    Bucket: env.R2_MEDIA_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ResponseCacheControl: "no-store",
  }), { expiresIn: 300 });
}

