---
name: WorkRate object storage migration
description: GCS migration for upload persistence; why, what changed, how it works end-to-end
---

## Rule
All customer photos and generated concept PNGs must go through Replit Object Storage (GCS-backed). Never store production uploads on local disk only.

**Why:** Production runs on autoscale. The `uploads/` local dir is ephemeral — wiped on every container restart or instance change. URLs stored in the DB become dead links. The React SPA catch-all serves index.html for missing `/uploads/*` paths, returning HTTP 200 with 1360 bytes of HTML — a silent false-positive that masks the 404.

**How to apply:**
- `uploadBufferToStorage(buffer, contentType)` in `artifacts/api-server/src/lib/storageUpload.ts` → returns `{ objectPath }` (e.g. `/objects/uploads/{uuid}.jpg`)
- `storageServingUrl(req, objectPath)` → constructs full HTTPS URL using `req.protocol` (trust proxy is set, so this is `https` in production)
- `downloadBufferFromStorage(objectPath)` → fetches from GCS for server-side reads
- `isStorageUrl(url)` / `parseObjectPath(url)` → detect and extract objectPath from full serving URLs
- GCS serving: `GET /api/storage/objects/*` route in `routes/storage.ts`, registered in `routes/index.ts`
- Legacy local disk URLs (`/uploads/...`) still handled by `isStorageUrl()` → false → local disk fallback (for old dev records)

**Path convention:**
- `PRIVATE_OBJECT_DIR` = `/replit-objstore-{uuid}/private`
- GCS objectName = `private/uploads/{uuid}.ext` (strip bucket from dir prefix)
- objectPath returned = `/objects/uploads/{uuid}.ext`
- Retrieval: `getObjectEntityFile("/objects/uploads/{uuid}.ext")` reconstructs `PRIVATE_OBJECT_DIR/uploads/{uuid}.ext` ✓

**trust proxy:** `app.set("trust proxy", true)` added to `artifacts/api-server/src/app.ts` — required for `req.protocol` to return `https` behind Replit's reverse proxy.
