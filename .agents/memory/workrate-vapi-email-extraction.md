---
name: WorkRate Vapi call email extraction
description: How customer emails are pulled from Vapi call transcripts reliably, and when the system deliberately leaves the email blank instead of guessing.
---

Emails from phone calls come from spoken/spelled speech, not typed text, so a naive regex over the raw transcript is unreliable (mishears, spelled-out corrections, unrelated "at"/"dot" words in normal prose).

**Why:** an earlier approach that blanket-collapsed whitespace around punctuation caused false merges — e.g. "gmail.com. Caller:" became "gmail.com.caller" by fusing the next sentence onto the email. The fix only lets each spoken-connector token ("at", "dot", "dash", "underscore", "plus") consume its own surrounding whitespace, and only scans text segments that already contain an email "cue" (an "@", the word "dot"/"email", or a TLD pattern) before attempting extraction, to avoid false positives from ordinary prose.

**How to apply:** when multiple distinct email candidates appear in one transcript, only trust the later one if a correction phrase ("actually", "sorry", "no it's", "correction", "i meant", "scratch that", "my mistake") appears between them. Otherwise treat it as ambiguous. If extraction produces zero or multiple unresolved candidates, use the semantic fallback on only the nearby email context. Vapi's own structured `customerEmail`/`email` field is trusted only if it's already a syntactically valid address.

**Known real-world STT quirk (fixed):** speech-to-text sometimes inserts a spurious sentence break mid-spelling (e.g. "H-U-N-T-L-E-Y" transcribed as "H. U-N-T-L-E-Y" after a caller pause). A lone single-letter token immediately before a hyphenated spelled run is now spliced onto that run before the misheard-word-override regex runs, so the letter isn't discarded and the surname isn't silently truncated. Verified against real (redacted/synthetic) production transcripts, not just clean unit-test phrasing.

**Semantic fallback rule:** only run it when deterministic parsing is not confident, and send only context near email cues. Require multiple independent model samples to reconstruct the same valid address before writing it. Any disagreement, medium/low confidence, malformed response, missing configuration, or API failure must leave the enquiry email blank and flag confirmation. Preserve a suggested candidate only in internal follow-up notes.

**Why:** exact character reconstruction from garbled speech can produce plausible but confidently wrong addresses. Agreement across independent samples is a stricter write barrier than trusting one model's self-reported confidence.

**How to apply:** keep deterministic extraction first. Run semantic extraction outside database transactions so network latency does not hold a connection open, and skip it entirely for duplicate webhook deliveries.
