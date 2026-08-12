---
name: WorkRateVisualTesting shortcut
description: Internal two-phase test shortcut that exercises the full production photo/concept pipeline
---

## Rule
`WorkRateVisualTesting` is a two-phase internal test shortcut in the live widget. It must never be advertised. It uses the real production pipeline end-to-end.

**Why:** Lets Ollie test photo upload → GCS persistence → dashboard display → concept visual generation without running the full AI Q&A each time.

**Phase 1 — message handler (`chat.ts` send message route):**
- Exact-match trigger: `body.data.content.trim() === "WorkRateVisualTesting"`
- Updates enquiry: `customerName = "[TEST] Visual Test"`, `customerEmail = "orhuntley@gmail.com"`, `projectType = "fitted wardrobes"`, `isTest = true`, budget/timescale/description pre-filled
- Replies: "⚡ Visual test mode activated — enquiry pre-filled with fitted wardrobes spec. Please upload ONE real photo of the room to test the full production pipeline."
- Sends `done: true` but NOT `completed: true` — waits for photo

**Phase 2 — upload handler (`chat.ts` upload route):**
- Detection: `enquiry.isTest === true && enquiry.customerName.startsWith("[TEST] Visual Test")`
- Vision analysis still runs (real production pipeline)
- Skips AI chat steps (system prompt, gpt-4o-mini completion)
- Calls `handleEnquiryCompletion(enquiry, {...existing fields...}, true)` → DB update + confirmation email
- Returns `{ completed: true, conceptVisualOffer: true, url: <GCS URL>, aiMessage: "📸 Photo saved..." }`

**Cleanup:** Covered by existing `DELETE /api/enquiries/test-data` endpoint which deletes all `isTest = true` enquiries for the current user. WorkRateVisualTesting sets `isTest = true` so these are automatically included.

**Detection contract:** Both AppTesting and VisualTesting use `isTest = true`. VisualTest is distinguished by `customerName = "[TEST] Visual Test"` (AppTesting uses `[TEST] WorkRate Test`).
