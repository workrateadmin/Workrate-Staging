---
name: Chat widget enquiry completion detection
description: How the widget knows an enquiry is complete and shows the success screen — and why text-matching fails.
---

## The Rule

The widget's "Enquiry submitted!" success screen must be triggered by the **server-sent `completed: true` SSE event**, not by text-matching on AI-generated phrases.

**Why:** Text-matching (`includes("been submitted")`, etc.) is fragile — the AI model may paraphrase the closing message on any given run. This was the root cause of the widget regression (enquiry saved in DB, success screen never shown).

**How to apply:** When the server detects `ENQUIRY_COMPLETE:{...}` in the AI output, it must emit `res.write('data: {"completed":true}\n\n')` **before** `done: true`. The widget reads `ev.completed` in the SSE loop and calls `setIsComplete(true)` immediately.

## Architecture

- Server (`chat.ts`): emits `{"completed":true}` SSE event when `completionMatch` is found
- Widget (`chat-widget.tsx`): in the SSE parsing loop, checks `ev.completed` alongside `ev.content`
- Text-matching remains as a fallback in the `finally` block (belt-and-suspenders)

## What NOT to change

- Do not remove the `ENQUIRY_COMPLETE:{...}` JSON marker from the AI prompt — it's what triggers the server-side DB update
- Do not move completion detection back to text-matching only
- The `done: true` event signals stream end, not enquiry completion — these are distinct
