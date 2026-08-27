---
name: WorkRate Vapi call email extraction
description: How customer emails are pulled from Vapi call transcripts reliably, and when the system deliberately leaves the email blank instead of guessing.
---

Emails from phone calls come from spoken/spelled speech, not typed text, so a naive regex over the raw transcript is unreliable (mishears, spelled-out corrections, unrelated "at"/"dot" words in normal prose).

**Why:** an earlier approach that blanket-collapsed whitespace around punctuation caused false merges — e.g. "gmail.com. Caller:" became "gmail.com.caller" by fusing the next sentence onto the email. The fix only lets each spoken-connector token ("at", "dot", "dash", "underscore", "plus") consume its own surrounding whitespace, and only scans text segments that already contain an email "cue" (an "@", the word "dot"/"email", or a TLD pattern) before attempting extraction, to avoid false positives from ordinary prose.

**How to apply:** when multiple distinct email candidates appear in one transcript, only trust the later one if a correction phrase ("actually", "sorry", "no it's", "correction", "i meant", "scratch that", "my mistake") appears between them. Otherwise treat it as ambiguous. If extraction produces zero or multiple unresolved candidates, leave the email blank and flag it for confirmation rather than guessing — never silently pick one. Vapi's own structured `customerEmail`/`email` field is trusted only if it's already a syntactically valid address; otherwise fall back to transcript extraction.

**Known real-world STT quirk (fixed):** speech-to-text sometimes inserts a spurious sentence break mid-spelling (e.g. "H-U-N-T-L-E-Y" transcribed as "H. U-N-T-L-E-Y" after a caller pause). A lone single-letter token immediately before a hyphenated spelled run is now spliced onto that run before the misheard-word-override regex runs, so the letter isn't discarded and the surname isn't silently truncated. Verified against real (redacted/synthetic) production transcripts, not just clean unit-test phrasing.

**Known unresolved limitation:** when a caller's email is never captured as one clean utterance — spread messily across several corrected turns with plain-word gaps and no explicit connector words — the parser can still pick just the last word before "at" and report it as "confident" even though it's wrong (e.g. "...toilet rolls at takemi.com" → confidently returns "rolls@takemi.com"). No safe heuristic was found that catches this without also flagging ordinary valid phrasing like "my email is john@gmail.com" as ambiguous, since both look identical (a word ending in a letter, then the email) without semantic understanding. Closing this gap for real needs semantic/LLM-based extraction, not another regex tweak.
