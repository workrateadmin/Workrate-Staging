---
name: WorkRate concept visuals
description: Phase 1 AI Concept Visuals feature — architecture, DB, routes, widget flow, gotchas
---

# Concept Visuals — Phase 1

## What it does
After a joinery enquiry completes (via photo upload), the chat widget offers the customer an AI-generated concept image showing their room photo with the proposed joinery overlaid. Uses `gpt-image-1` `images.edit()`.

## DB table: concept_visuals
- `lib/db/src/schema/concept_visuals.ts` — new table
- Migration `0007_concept_visuals` in `lib/db/src/migrate.ts`
- Status flow: `offered → generating → generated → selected | skipped | revision_requested | failed`
- Max 2 generated images per enquiry (enforced server-side by counting `generatedImageUrl IS NOT NULL`)

## API routes (`artifacts/api-server/src/routes/concept-visuals.ts`)
- `POST /api/chat/:token/concept-visual/generate` — validates token, checks supported trade type and max-2 limit, reads photo from disk, converts to PNG32, calls `gpt-image-1`, saves base64 PNG to `uploads/concept-{ts}-{hex}.png`, returns `{ conceptId, imageUrl, status }`
- `POST /api/chat/:token/concept-visual/:conceptId/feedback` — records `selected | skipped | revision_requested`, updates `customerFeedback` and `isPreferred`
- `GET /api/enquiries/:id/concept-visuals` — Clerk-authenticated, for dashboard; returns all concept visuals for an enquiry

## CRITICAL: JPEG→PNG conversion required
**gpt-image-1 `images.edit()` only accepts PNG (PNG32/RGBA) — JPEG and other formats fail with "Invalid image file or mode".**

Fix: use ImageMagick (pre-installed in Replit NixOS at `/nix/store/.../bin/magick`) to convert before calling OpenAI:
```typescript
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const tempPng = path.join(tmpdir(), `cv-${randomBytes(6).toString("hex")}.png`);
execSync(`magick "${photoPath}" -colorspace sRGB -alpha set "PNG32:${tempPng}"`, { timeout: 15_000, stdio: "pipe" });
// Use tempPng as the image input; delete it in finally block
```
Always clean up the temp file with `unlinkSync(tempPng)` in a `finally` block.

## Supported trade types for offer
Set defined inline in both `concept-visuals.ts` (exported) and `chat.ts` (inline):
`joinery, fitted wardrobes, freestanding wardrobes, media wall, media units, alcove units, home office, bespoke joinery, kitchen installation, built-in storage`

## Widget UX flow (`artifacts/workrate/src/components/chat-widget.tsx`)
- State machine: `idle → offered → generating → generated → awaiting_revision | done | failed`
- Green "Enquiry submitted" card is hidden while concept state is `offered/generating/generated/awaiting_revision`; shown when state is `idle`, `done`, or `failed`
- This ensures the offer feels like part of the completion flow, not an afterthought
- 90s client-side AbortController timeout on generate fetch calls
- Offer comes with "One more thing…" header — not shown after the green card

## Server timeouts
- Server: `AbortSignal.timeout(85_000)` on OpenAI call (85s, slightly shorter than client's 90s)
- Client: `AbortController` with `setTimeout(90_000)` on fetch

## Generation performance (measured)
- Typical duration: 52–70s (average ~60s)
- Output: 1024×1024 PNG, ~1.4–1.6MB
- Max-2 block check: <15ms (pure DB count query)
- Widget copy: "This usually takes around a minute" (accurate; do not say 30s)

## Prompt architecture
Detailed 4-section structure in `buildConceptPrompt()`:
1. Intro (edit framing)
2. PRESERVE EXACTLY rules (walls, windows, doors, ceiling, floor, radiators, sockets, geometry, camera, lighting)
3. JOINERY TO ADD (project type + full description + placement + unspecified fallback)
4. PHOTOREALISM REQUIREMENTS (perspective, shadows, materials, no overlays)
5. Optional CUSTOMER REVISION REQUEST section

## QA test results (all passed)
| Scenario | Time | Size |
|---|---|---|
| Fitted wardrobes (shaker, Elephant's Breath, alcove) | 55.5s | 1,478KB |
| Freestanding wardrobes (sage green, dentil cornice) | 52.7s | 1,442KB |
| Media units (matt black, 65" TV recess, handleless) | 70.0s | 1,462KB |
| Alcove units (Victorian, All White, chimney flanks) | 63.5s | 1,519KB |
| Revision (navy blue doors, brass cup handles) | 64.9s | 1,422KB |
| Max-2 block (3rd attempt) | <15ms | — blocked ✅ |
| No photo attachment | instant | — 400 ✅ |
| Invalid token | instant | — 404 ✅ |

**Why:** Keep concept visual generation completely decoupled from the enquiry submission pipeline — a generation failure never blocks the customer.
