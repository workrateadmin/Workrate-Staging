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
  // Do this before rejoinInterruptedSpelling: otherwise the trailing "s" in
  // "it's J-O-H-N" looks like a stray spelled letter and becomes
  // "s-J-O-H-N".
  const withoutLeadingContraction = text.replace(
    /\bit['’]s\s+(?=(?:[a-z]-){1,}[a-z]\b)/gi,
    "",
  );
  const rejoined = rejoinInterruptedSpelling(withoutLeadingContraction);
  const withOverrides = rejoined.replace(
    // Require at least two letters in the presumed misheard whole word.
    // Otherwise the trailing "s" in a phrase such as "it's J-O-H-N" is
    // mistaken for a speech-recognition guess and consumes the J-O-H-N run.
    /\b([a-z]{2,})\b\s*[,.]?\s*((?:[a-z]-){1,}[a-z])\b/gi,
    (_match, word: string, letters: string) => {
      const collapsed = letters.replace(/-/g, "").toLowerCase();
      // Spoken connector words are syntax, not STT guesses. In
      // "J-O-H-N dot S-M-I-T-H", keep "dot" so the next stage can turn it
      // into ".", while still collapsing the spelling after it.
      if (["at", "dot", "underscore", "dash", "hyphen", "plus"].includes(word.toLowerCase())) {
        return `${word} ${collapsed}`;
      }
      return collapsed;
    },
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

// --- Semantic fallback -----------------------------------------------------
//
// The deterministic pipeline above handles the vast majority of real
// transcripts, but speech-to-text sometimes garbles a spelled-out email badly
// enough (a misheard whole word interleaved with spelling, a spelling run
// split across multiple sentence breaks, etc.) that no fixed regex can
// recover it safely. Rather than keep adding narrower and narrower regex
// patches — each one a new way to accidentally mis-parse a *different*
// transcript — we fall back to an LLM for exactly this narrow task: given
// only the transcript text right around the customer's email statement,
// reconstruct the email from explicit spoken/spelled evidence, or say it
// can't be done. It only ever runs when the deterministic parser is not
// already confident, and it is bound by the same "never guess" rule.

export type SemanticEmailResult = {
  email: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string;
  needsConfirmation: boolean;
};

const NO_CONTEXT_RESULT: SemanticEmailResult = {
  email: null,
  confidence: "low",
  evidence: "",
  needsConfirmation: true,
};

// Extracts only the text around plausible email-related speech, instead of
// shipping the whole call transcript to the model. Keeps the prompt small,
// keeps unrelated parts of the conversation (name, address, job details) out
// of the request, and gives the model less room to pull in irrelevant words.
export function extractEmailContext(text: string, windowChars = 220): string {
  const cueRegex = new RegExp(EMAIL_CUE_PATTERN.source, "gi");
  const windows: Array<[number, number]> = [];
  for (const match of text.matchAll(cueRegex)) {
    const index = match.index ?? 0;
    windows.push([Math.max(0, index - windowChars), Math.min(text.length, index + (match[0]?.length ?? 0) + windowChars)]);
  }
  if (windows.length === 0) return "";

  windows.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of windows) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([start, end]) => text.slice(start, end).trim()).join(" ... ");
}

function coerceSemanticResult(raw: unknown): SemanticEmailResult {
  if (!raw || typeof raw !== "object") return { ...NO_CONTEXT_RESULT, evidence: "unparseable_response" };
  const obj = raw as Record<string, unknown>;
  const confidence = obj.confidence === "high" || obj.confidence === "medium" || obj.confidence === "low"
    ? obj.confidence
    : "low";
  const emailCandidate = typeof obj.email === "string" ? obj.email.trim().toLowerCase() : null;
  const validEmail = emailCandidate && isValidEmail(emailCandidate) ? emailCandidate : null;
  const evidence = typeof obj.evidence === "string" ? obj.evidence : "";

  // The model's own needsConfirmation flag is advisory only — we independently
  // enforce the "never guess" rule: only an explicitly high-confidence, valid
  // email is ever treated as unconfirmed. Anything else is flagged regardless
  // of what the model claims, matching the deterministic parser's behaviour.
  const needsConfirmation = !(validEmail && confidence === "high");
  return { email: validEmail, confidence, evidence, needsConfirmation };
}

const SEMANTIC_SYSTEM_PROMPT = `You reconstruct a customer's email address from a fragment of a real phone call transcript (produced by imperfect speech-to-text). You will be given only the portion of the transcript near where the customer stated their email.

Rules — follow them exactly:
- Prefer explicit letter-by-letter spelling over a speech-recognition guess at a whole word.
- Critical: when a misheard whole word is immediately followed by an explicit letter-by-letter spelling of what is clearly the same word, the spelling REPLACES that word — it does not get appended or concatenated alongside it. The speaker said one word, the speech-to-text misheard it, and the speaker then spelled the true word — use only the spelled-out version, never the misheard word, and never both forms mixed together.
- Critical: single letters joined by hyphens directly onto a following word with no space or punctuation (e.g. "B-K-Sanderson") are still separately spelled letters ("B", "K") followed by a distinct word ("Sanderson") — they are not one fused word. Keep the leading spelled letters even when the word right after them turns out to be a misheard guess that gets replaced by its own later spelling.
- Understand spoken connectors: "at", "dot", "underscore", "hyphen"/"dash", "plus".
- The transcript may have pauses or punctuation inserted mid-spelling by the speech-to-text system (e.g. a stray period or sentence break in the middle of a spelled run, or a spelling run interrupted by a misheard word) — look past that noise and reassemble the single intended spelling.
- A spelled name may be split across multiple adjacent fragments; join them in the order given into one continuous spelling.
- Use conversational context like "my email is..." to identify what is actually being spelled.
- Never invent or guess a missing letter, word, or domain. If any part of the local part or domain cannot be reconstructed from explicit evidence in the text, return email: null.
- Do not infer a surname or name from anything other than what is explicitly spelled or stated in this fragment.
- If you are not fully certain, prefer confidence "low" or "medium" over "high" — "high" must mean the email is unambiguous and fully supported by explicit evidence, with no leftover uncertainty about which words were replaced by a spelling.
- Before answering, work out the exact letter sequence for each spelled part step by step, and double-check you have not mixed letters from a discarded misheard word into the final spelling.

Worked example of the pattern (illustrative only — a different transcript than the one you'll actually be given, showing the reasoning method, not an answer to reuse):
Input fragment: "it's B-K-Sanderson. S-A-N. D-E-R-T-O-N at yahoo dot com."
Reasoning: "B" and "K" are spelled initial letters directly followed by the word "Sanderson" with no space — that word is still separate from the letters before it, not fused into them. "Sanderson" itself is a misheard whole-word guess at the surname — set the WORD aside entirely (but keep the "B" and "K" letters before it), because it is immediately followed by an explicit spelling of the true surname, interrupted mid-run: "S-A-N." then "D-E-R-T-O-N", giving "sanderton" — exactly those letters, nothing from "Sanderson" mixed in. Local part = "b" + "k" + "sanderton" = "bksanderton". Domain = "yahoo.com".
Output for that illustrative example: {"email": "bksanderton@yahoo.com", "confidence": "high", "evidence": "Spelled B-K, then Sanderson replaced by its own interrupted spelling S-A-N...D-E-R-T-O-N, at yahoo.com.", "needsConfirmation": false}
Apply the same discipline to whatever names and spellings actually appear in the transcript you are given — never reuse this example's letters or answer.

Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"email": string | null, "confidence": "high" | "medium" | "low", "evidence": string, "needsConfirmation": boolean}

"evidence" should briefly quote or describe the specific words that support your answer (or explain why you could not reconstruct it). Set "needsConfirmation" to true unless the email is fully explicit and confidence is "high".`;

let cachedOpenAIClient: import("openai").default | undefined;

async function getSemanticClient(): Promise<import("openai").default | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!cachedOpenAIClient) {
    const OpenAI = (await import("openai")).default;
    cachedOpenAIClient = new OpenAI({ apiKey });
  }
  return cachedOpenAIClient;
}

async function runSemanticSample(client: import("openai").default, contextText: string): Promise<SemanticEmailResult> {
  const completion = await client.chat.completions.create({
    // Uses the larger model (matching this codebase's convention for other
    // correctness-critical structured extraction, e.g. cost-intelligence and
    // receipt parsing) rather than gpt-4o-mini: reconstructing an exact
    // character sequence from garbled speech-to-text is easy to get subtly
    // wrong (e.g. blending letters from a discarded misheard word into the
    // real spelling), and a wrong high-confidence email is worse than a
    // slower call.
    model: "gpt-4o",
    max_tokens: 300,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SEMANTIC_SYSTEM_PROMPT },
      { role: "user", content: `Transcript fragment:\n"""\n${contextText}\n"""` },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { ...NO_CONTEXT_RESULT, evidence: "empty_response" };
  return coerceSemanticResult(JSON.parse(raw));
}

const SEMANTIC_SAMPLE_COUNT = 3;

// Runs only when the deterministic parser above did not produce a confident
// email. Never throws — any failure (missing key, network, malformed
// response) resolves to the same "leave it blank, ask a human" outcome that
// the deterministic parser already uses for its own ambiguous/none cases.
//
// A single LLM call's self-reported "high confidence" isn't trustworthy
// enough on its own for a heavily garbled transcript — reconstructing an
// exact character sequence is exactly the kind of task a model can get
// subtly, confidently wrong (e.g. dropping or blending a letter). Instead we
// sample the model multiple times independently: only an email every sample
// reconstructs identically is treated as confirmed. Disagreement across
// samples is itself strong evidence the reconstruction isn't reliable, so it
// is treated the same as low confidence rather than trusting any one sample.
export async function extractEmailSemantic(contextText: string): Promise<SemanticEmailResult> {
  if (!contextText.trim()) return NO_CONTEXT_RESULT;

  const client = await getSemanticClient();
  if (!client) return { ...NO_CONTEXT_RESULT, evidence: "openai_not_configured" };

  let samples: SemanticEmailResult[];
  try {
    samples = await Promise.all(
      Array.from({ length: SEMANTIC_SAMPLE_COUNT }, () => runSemanticSample(client, contextText)),
    );
  } catch {
    return { ...NO_CONTEXT_RESULT, evidence: "extraction_failed" };
  }

  const counts = new Map<string, number>();
  for (const sample of samples) {
    if (sample.email) counts.set(sample.email, (counts.get(sample.email) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return {
      email: null,
      confidence: "low",
      evidence: samples.find((s) => s.evidence)?.evidence ?? "",
      needsConfirmation: true,
    };
  }

  const [bestEmail, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const unanimous = bestCount === SEMANTIC_SAMPLE_COUNT;
  const matching = samples.find((s) => s.email === bestEmail);
  return {
    email: bestEmail,
    confidence: unanimous ? "high" : bestCount >= 2 ? "medium" : "low",
    evidence: matching?.evidence ?? "",
    needsConfirmation: !unanimous,
  };
}

// Convenience entry point mirroring extractEmailFromTranscript: runs the
// deterministic parser first, and only spends an LLM call when it wasn't
// confident. This is what callers should use end-to-end.
export async function extractEmailWithFallback(rawTranscript: string | null): Promise<{
  deterministic: EmailExtractionResult;
  semantic: SemanticEmailResult | null;
}> {
  const deterministic = extractEmailFromTranscript(rawTranscript);
  if (deterministic.status === "confident") {
    return { deterministic, semantic: null };
  }
  const context = extractEmailContext(transcriptToText(rawTranscript));
  const semantic = await extractEmailSemantic(context);
  return { deterministic, semantic };
}
