/**
 * Server-side upload utility for Replit Object Storage.
 *
 * The chat upload handler and concept-visuals route write files server-side
 * (not via presigned URLs). This utility wraps the GCS client so both routes
 * can upload and download without sharing implementation details.
 */
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage";
import {
  objectPathForNewObject,
  requireStorageEnvironmentConfig,
  resolvePrivateObjectPath,
} from "./storage-environment";
import { getWorkRateEnvironment } from "./runtime-environment";

// ── Public API ────────────────────────────────────────────────────────────────

export interface StorageUploadResult {
  /** e.g. "/objects/development/uploads/{uuid}.png" */
  objectPath: string;
}

/**
 * Upload a Buffer to object storage.
 * Returns the objectPath suitable for serving via GET /api/storage/objects/*.
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  namespace = "uploads",
): Promise<StorageUploadResult> {
  const storage = requireStorageEnvironmentConfig();

  const ext = contentType === "image/png" ? "png"
    : (contentType === "image/jpeg" || contentType === "image/jpg") ? "jpg"
    : contentType === "image/webp" ? "webp"
    : (contentType === "image/heic" || contentType === "image/heif") ? "heic"
    : contentType === "application/pdf" ? "pdf"
    : contentType.includes("spreadsheetml") ? "xlsx"
    : contentType === "application/vnd.ms-excel" ? "xls"
    : contentType === "text/csv" ? "csv"
    : contentType.includes("wordprocessingml") ? "docx"
    : contentType === "application/msword" ? "doc"
    : "bin";

  const uuid = randomUUID();
  // Namespaces let sensitive domains opt out of the generic storage serving
  // route while preserving the existing upload path for normal app assets.
  const safeNamespace = /^[a-z0-9_-]+$/i.test(namespace) ? namespace : "uploads";
  const relativePath = `${safeNamespace}/${uuid}.${ext}`;
  const gcsObjectName = `${storage.environmentObjectPrefix}/${relativePath}`;

  const bucket = objectStorageClient.bucket(storage.bucketId);
  const file = bucket.file(gcsObjectName);
  await file.save(buffer, { contentType, resumable: false });

  const objectPath = objectPathForNewObject(relativePath, storage);
  return { objectPath };
}

/**
 * Download an object from storage into a Buffer.
 * @param objectPath - the environment-scoped path returned by uploadBufferToStorage
 */
export async function downloadBufferFromStorage(objectPath: string): Promise<Buffer> {
  const resolved = resolvePrivateObjectPath(objectPath);

  const bucket = objectStorageClient.bucket(resolved.bucketId);
  const file = bucket.file(resolved.objectName);
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
  resolvePrivateObjectPath(objectPath);
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/api/storage${objectPath}`;
}

export function storageServingUrlFromRuntime(objectPath: string): string {
  resolvePrivateObjectPath(objectPath);
  const explicit = process.env.WORKRATE_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (explicit) return `${explicit}/api/storage${objectPath}`;

  const developmentHost = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (getWorkRateEnvironment() === "development" && developmentHost) {
    return `https://${developmentHost}/api/storage${objectPath}`;
  }
  throw new Error("WORKRATE_PUBLIC_URL is required to create storage URLs.");
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
  if (url.startsWith("/objects/")) {
    resolvePrivateObjectPath(url);
    return url;
  }
  const match = url.match(/\/api\/storage(\/objects\/.*)/);
  if (match?.[1]) {
    resolvePrivateObjectPath(match[1]);
    return match[1];
  }
  throw new Error(`Cannot parse objectPath from URL: "${url}"`);
}
