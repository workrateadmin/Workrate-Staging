import assert from "node:assert/strict";
import test from "node:test";
import { extractEmailFromText, extractEmailFromTranscript, isValidEmailAddress } from "../src/services/vapi-email";

test("literal email in a transcript sentence is extracted directly", () => {
  const result = extractEmailFromText("Caller: My email is john.smith@gmail.com, thanks.");
  assert.equal(result.status, "confident");
  assert.equal(result.email, "john.smith@gmail.com");
});

test("phonetic email (spoken 'dot' and 'at') is normalized", () => {
  const result = extractEmailFromText("Caller: It's john dot smith at gmail dot com");
  assert.equal(result.status, "confident");
  assert.equal(result.email, "john.smith@gmail.com");
});

test("real example: word-then-spelled-letters overrides the misheard word for both local part and domain word", () => {
  const result = extractEmailFromText("Is jaman, J-M-A-N, dot hunsley. H-U-N-T-L-E-Y, at gmail.COM");
  assert.equal(result.status, "confident");
  assert.equal(result.email, "jman.huntley@gmail.com");
});

test("spelled letters split by a stray sentence break (real-world STT quirk) are still rejoined correctly", () => {
  // Speech-to-text sometimes inserts a spurious full stop right after the first
  // spelled letter (e.g. a caller pause), splitting "W-A-L-S-H" into "W. A-L-S-H".
  // Without rejoining, the lone "w" is discarded as if it were its own misheard
  // word, silently truncating the surname to "alsh" instead of "walsh".
  const result = extractEmailFromText("It's sam, S-A-M, dot walsh. W. A-L-S-H, at hotmail.com");
  assert.equal(result.status, "confident");
  assert.equal(result.email, "sam.walsh@hotmail.com");
});

test("standalone spelled local part with no preceding attempted word", () => {
  const result = extractEmailFromText("Caller: J-O-H-N dot smith at gmail dot com");
  assert.equal(result.status, "confident");
  assert.equal(result.email, "john.smith@gmail.com");
});

test("underscore, hyphen, and plus addressing are all normalized", () => {
  assert.equal(extractEmailFromText("john underscore smith at gmail dot com").email, "john_smith@gmail.com");
  assert.equal(extractEmailFromText("john dash smith at gmail dot com").email, "john-smith@gmail.com");
  assert.equal(extractEmailFromText("a literal hyphen like john-smith@gmail.com stays intact").email, "john-smith@gmail.com");
  assert.equal(extractEmailFromText("john plus newsletter at gmail dot com").email, "john+newsletter@gmail.com");
});

test("a correction after a mishearing keeps the later, corrected email", () => {
  const result = extractEmailFromText(
    "Caller: It's dave at gmail dot com. Actually sorry, it's dave at hotmail dot com.",
  );
  assert.equal(result.status, "confident");
  assert.equal(result.email, "dave@hotmail.com");
});

test("two genuinely conflicting candidates with no correction language are flagged, not guessed", () => {
  const result = extractEmailFromText(
    "Caller: You can reach me at dave at gmail dot com. Caller: Or try dave at yahoo dot com.",
  );
  assert.equal(result.status, "ambiguous");
  assert.equal(result.email, null);
  assert.deepEqual(result.candidates, ["dave@gmail.com", "dave@yahoo.com"]);
});

test("no email mentioned leaves the result as none, without inventing a fake match", () => {
  const result = extractEmailFromText("Caller: I'd like a quote for a new kitchen, please. Meet me at the site.");
  assert.equal(result.status, "none");
  assert.equal(result.email, null);
});

test("transcript stored as a JSON turns array is read the same way as a plain string", () => {
  const transcript = JSON.stringify([
    { role: "ai", content: "What's the best email for you?" },
    { role: "caller", content: "It's priya dot shah at outlook dot com" },
  ]);
  const result = extractEmailFromTranscript(transcript);
  assert.equal(result.status, "confident");
  assert.equal(result.email, "priya.shah@outlook.com");
});

test("isValidEmailAddress rejects malformed candidates", () => {
  assert.equal(isValidEmailAddress("john.smith@gmail.com"), true);
  assert.equal(isValidEmailAddress("john..smith@gmail.com"), false);
  assert.equal(isValidEmailAddress("john@gmail"), false);
  assert.equal(isValidEmailAddress("not-an-email"), false);
});
