// Reusable transcript email extraction for phone enquiries (Vapi and any future
// voice provider). Callers speak emails in three main ways — literally
// ("john.smith@gmail.com"), phonetically ("john dot smith at gmail dot com"), or
// spelled out ("jaman, J-M-A-N, dot hunsley, H-U-N-T-L-E-Y, at gmail dot com") —
// and sometimes correct themselves mid-call. This module normalizes all three
// into a single candidate pipeline so a confident, ambiguous, or missing result
// is treated consistently everywhere phone transcripts are processed.

export type EmailExtractionResult = {
  email: string | null;
  status: "confident" | "ambiguous" | "none";
  candidates: string[];
};

const EMAIL_PATTERN = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g;

// A segment must plausibly encode a spoken/written email before we run the
// phonetic transform over it — otherwise ordinary sentences containing "at"
// ("call me at the site") could accidentally collapse into a fake "word@word"
// match. Requiring one of these cues keeps the transform scoped to real
// email-shaped speech.
const EMAIL_CUE_PATTERN = /\bdot\b|@|\bemail\b|\be-mail\b|\.(?:com|co\.uk|org|net|co|io|me)\b/i;

// Explicit correction language lets a later, differing candidate override an
// earlier one instead of being treated as a conflict (e.g. "actually it's ...").
const CORRECTION_PATTERN = /\b(actually|sorry|no,?\s*it'?s|correction|i meant|scratch that|let me correct that|my mistake)\b/i;

function isValidEmail(value: string): boolean {
  if (!/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(value)) return false;
  if (value.includes("..")) return false;
  if (value.includes("@.") || value.includes(".@")) return false;
  const [, domain] = value.split("@");
  if (!domain || domain.startsWith("-") || domain.endsWith("-")) return false;
  return true;
}

// Real transcripts sometimes insert a spurious sentence break in the middle of
// a spelled-out run (e.g. speech-to-text renders "H-U-N-T-L-E-Y" as "H. U-N-T-L-E-Y"
// because of a caller pause after the first letter). Without this, the lone "H."
// gets treated by the override regex below as a separate misheard "word" and is
// silently discarded, truncating the result (e.g. "huntley" -> "untley") instead
// of leaving it for a human to confirm. Splicing a single stray letter back onto
// an immediately-following hyphenated run keeps the two regexes below unchanged.
function rejoinInterruptedSpelling(text: string): string {
  return text.replace(
    /\b([a-z])[.,]?\s+((?:[a-z]-){1,}[a-z]\b)/gi,
    (_match, letter: string, rest: string) => `${letter}-${rest}`,
  );
}

// Collapses "<misheard word>, <L-E-T-T-E-R-S>" into the spelled letters, since an
// explicit spelling always overrides a likely speech-to-text error (e.g.
// "jaman, J-M-A-N" -> "jman"). Then collapses any remaining standalone spelled
// sequence (no preceding word) the same way.
function applyLetterSpelling(text: string): string {
  const rejoined = rejoinInterruptedSpelling(text);
  const withOverrides = rejoined.replace(
    /\b([a-z]+)\b\s*[,.]?\s*((?:[a-z]-){1,}[a-z])\b/gi,
    (_match, _word, letters: string) => letters.replace(/-/g, "").toLowerCase(),
  );
  return withOverrides.replace(
    /\b((?:[a-z]-){1,}[a-z])\b/gi,
    (letters) => letters.replace(/-/g, "").toLowerCase(),
  );
}

// Each replacement consumes only the whitespace immediately touching the
// connector WORD itself (e.g. " at " -> "@"). This must not become a blanket
// "collapse all whitespace around @/./_/+/-" pass — that would also swallow the
// space after an unrelated sentence-ending period (e.g. "...gmail.com. Caller:
// ...") and fuse the next sentence onto the email.
function applySpokenConnectors(text: string): string {
  return text
    .replace(/\s*\bat\b\s*/gi, "@")
    .replace(/\s*\bdot\b\s*/gi, ".")
    .replace(/\s*\bunderscore\b\s*/gi, "_")
    .replace(/\s*\bdash\b\s*/gi, "-")
    .replace(/\s*\bhyphen\b\s*/gi, "-")
    .replace(/\s*\bplus\b\s*/gi, "+")
    .replace(/,/g, "");
}

function findEmailCandidates(segment: string): Array<{ value: string; index: number }> {
  if (!EMAIL_CUE_PATTERN.test(segment)) return [];
  const lowered = segment.toLowerCase();
  const transformed = applySpokenConnectors(applyLetterSpelling(lowered));
  const matches = [...transformed.matchAll(EMAIL_PATTERN)];
  return matches
    .map((match) => ({ value: match[0], index: match.index ?? 0 }))
    .filter((candidate) => isValidEmail(candidate.value));
}

// Splits transcript JSON (array of {role, content}) into plain text, or passes
// through a raw string transcript unchanged. Either shape is handled the same
// way from here since correction detection works over the full concatenated text.
function transcriptToText(rawTranscript: string | null): string {
  if (!rawTranscript) return "";
  try {
    const parsed = JSON.parse(rawTranscript);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => (typeof entry?.content === "string" ? entry.content : ""))
        .filter(Boolean)
        .join(" \n ");
    }
  } catch {
    // Not JSON — treat as a plain transcript string.
  }
  return rawTranscript;
}

export function extractEmailFromText(text: string): EmailExtractionResult {
  const candidates = findEmailCandidates(text);
  if (candidates.length === 0) return { email: null, status: "none", candidates: [] };

  const distinct: string[] = [];
  for (const candidate of candidates) {
    if (!distinct.includes(candidate.value)) distinct.push(candidate.value);
  }
  if (distinct.length === 1) {
    return { email: distinct[0], status: "confident", candidates: distinct };
  }

  const last = candidates[candidates.length - 1];
  const betweenFirstAndLast = text.slice(candidates[0].index, last.index);
  if (CORRECTION_PATTERN.test(betweenFirstAndLast) || CORRECTION_PATTERN.test(text)) {
    return { email: last.value, status: "confident", candidates: distinct };
  }

  return { email: null, status: "ambiguous", candidates: distinct };
}

export function extractEmailFromTranscript(rawTranscript: string | null): EmailExtractionResult {
  return extractEmailFromText(transcriptToText(rawTranscript));
}

export function isValidEmailAddress(value: string): boolean {
  return isValidEmail(value.toLowerCase());
}
