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
- Max 2 generated images per enquiry (enforced server-side)

## API routes (`artifacts/api-server/src/routes/concept-visuals.ts`)
- `POST /api/chat/:token/concept-visual/generate` — validates token, checks supported trade type and max-2 limit, reads photo from disk (via `uploads/` dir), calls `gpt-image-1`, saves base64 PNG to `uploads/concept-{ts}-{hex}.png`, returns `{ conceptId, imageUrl, status }`
- `POST /api/chat/:token/concept-visual/:conceptId/feedback` — records `selected | skipped | revision_requested`, updates `customerFeedback` and `isPreferred`
- `GET /api/enquiries/:id/concept-visuals` — Clerk-authenticated, for dashboard; returns all concept visuals for an enquiry

## Supported trade types
Set defined in both `concept-visuals.ts` (exported as `SUPPORTED_CONCEPT_TRADE_TYPES`) and inline in `chat.ts`:
`joinery, fitted wardrobes, freestanding wardrobes, media wall, media units, alcove units, home office, bespoke joinery, kitchen installation, built-in storage`

## Chat widget trigger (`artifacts/workrate/src/components/chat-widget.tsx`)
- Upload handler checks `data.conceptVisualOffer` in response JSON
- Sets `conceptState = "offered"` to trigger offer card
- State machine: `idle → offered → generating → generated → awaiting_revision | done`
- Max 1 revision (conceptGenCount < 2 guard)
- Functions: `handleCreateConcept`, `handleConceptFeedback`, `submitRevision`

## gpt-image-1 image generation
- Uses `toFile(fs.createReadStream(photoPath), filename)` from `openai/uploads`
- Response: `response.data[0]?.b64_json` — always base64, never URL
- PNG saved to same `uploads/` dir as other attachments, with `concept-` prefix
- Generation fails gracefully: DB record set to `failed`, widget shows "couldn't create" message, enquiry is unaffected

**Why:** Keep concept visual generation completely decoupled from the enquiry submission pipeline so a generation failure never blocks the customer.

## enquiry-detail ConceptVisualsPanel
- Added to `artifacts/workrate/src/pages/enquiry-detail.tsx` after `AttachmentsPanel`
- Fetches `GET /api/enquiries/:id/concept-visuals` via react-query
- Shows only visuals with status `generated | selected | skipped` (not `offered/generating/failed`)
- Includes lightbox on click, status badge, customer feedback, disclaimer text
- Returns null (renders nothing) when no generated visuals exist
