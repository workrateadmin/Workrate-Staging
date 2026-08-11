/**
 * Server-side upload utility for Replit Object Storage.
 *
 * The chat upload handler and concept-visuals route write files server-side
 * (not via presigned URLs). This utility wraps the GCS client so both routes
 * can upload and download without sharing implementation details.
 */
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage";

// ── Path helpers ──────────────────────────────────────────────────────────────

function getBucketId(): string {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — run setupObjectStorage()");
  return id;
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set — run setupObjectStorage()");
  return dir;
}

/**
 * Maps a GCS object name (within the private object dir) to the
 * `/objects/<entityId>` path the serving route expects.
 *
 * PRIVATE_OBJECT_DIR = "/{bucketId}/private"
 * GCS objectName = "private/uploads/{uuid}.png"
 * entityId = "uploads/{uuid}.png"  ← strip the leading "private/" prefix
 * objectPath = "/objects/uploads/{uuid}.png"
 */
function gcsObjectNameToObjectPath(gcsObjectName: string): string {
  const dir = getPrivateObjectDir(); // e.g. "/bucket/private"
  // Strip bucket component from dir: "/bucket/private" → "private"
  const dirWithinBucket = dir.replace(/^\/[^/]+\//, "");
  // Strip that prefix from the object name: "private/uploads/uuid.png" → "uploads/uuid.png"
  const entityId = gcsObjectName.startsWith(dirWithinBucket + "/")
    ? gcsObjectName.slice(dirWithinBucket.length + 1)
    : gcsObjectName;
  return `/objects/${entityId}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface StorageUploadResult {
  /** e.g. "/objects/uploads/{uuid}.png" — pass to `storageServingUrl()` */
  objectPath: string;
}

/**
 * Upload a Buffer to object storage.
 * Returns the objectPath suitable for serving via GET /api/storage/objects/*.
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
): Promise<StorageUploadResult> {
  const bucketId = getBucketId();
  const privateDir = getPrivateObjectDir();

  const ext = contentType === "image/png" ? "png"
    : (contentType === "image/jpeg" || contentType === "image/jpg") ? "jpg"
    : contentType === "image/webp" ? "webp"
    : "bin";

  const uuid = randomUUID();
  // Strip bucket from PRIVATE_OBJECT_DIR to get the within-bucket dir prefix
  const dirWithinBucket = privateDir.replace(/^\/[^/]+\//, ""); // "private"
  const gcsObjectName = `${dirWithinBucket}/uploads/${uuid}.${ext}`;

  const bucket = objectStorageClient.bucket(bucketId);
  const file = bucket.file(gcsObjectName);
  await file.save(buffer, { contentType, resumable: false });

  const objectPath = gcsObjectNameToObjectPath(gcsObjectName);
  return { objectPath };
}

/**
 * Download an object from storage into a Buffer.
 * @param objectPath - the `/objects/...` path returned by uploadBufferToStorage
 */
export async function downloadBufferFromStorage(objectPath: string): Promise<Buffer> {
  const bucketId = getBucketId();
  const privateDir = getPrivateObjectDir();

  if (!objectPath.startsWith("/objects/")) {
    throw new Error(`Invalid objectPath: must start with /objects/ (got "${objectPath}")`);
  }

  const entityId = objectPath.slice("/objects/".length); // "uploads/{uuid}.png"
  const dirWithinBucket = privateDir.replace(/^\/[^/]+\//, ""); // "private"
  const gcsObjectName = `${dirWithinBucket}/${entityId}`; // "private/uploads/{uuid}.png"

  const bucket = objectStorageClient.bucket(bucketId);
  const file = bucket.file(gcsObjectName);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Construct the full HTTPS serving URL for an objectPath.
 * Uses the host from the incoming request.
 *
 * In production behind Replit's proxy (with trust proxy enabled), req.protocol
 * is "https". In local dev it is "http" — both work since the serving route
 * is registered on the same server.
 */
export function storageServingUrl(
  req: { protocol: string; get: (header: string) => string | undefined },
  objectPath: string,
): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/api/storage${objectPath}`;
}

/**
 * Returns true when a stored attachment URL points to Object Storage
 * (i.e. was uploaded after the GCS migration).
 */
export function isStorageUrl(url: string): boolean {
  return url.includes("/api/storage/objects/");
}

/**
 * Extracts the objectPath (e.g. "/objects/uploads/{uuid}.png") from a full
 * storage serving URL or a bare objectPath.
 */
export function parseObjectPath(url: string): string {
  if (url.startsWith("/objects/")) return url;
  const match = url.match(/\/api\/storage(\/objects\/.*)/);
  if (match) return match[1];
  throw new Error(`Cannot parse objectPath from URL: "${url}"`);
}
