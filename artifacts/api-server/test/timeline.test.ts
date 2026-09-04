import assert from "node:assert/strict";
import test from "node:test";
import { deriveTimelineEvents, isOwnedBy, pageFetchedRows, paginateTimeline } from "../src/lib/timeline";

const enquiry = { id: 1, createdAt: new Date("2025-01-01T00:00:00Z"), updatedAt: new Date("2025-01-01T00:00:02Z"), status: "new_enquiry", channel: "widget", projectType: null };

test("timeline derives only explicit linked facts and exposes no call transcript", () => {
  const events = deriveTimelineEvents({
    enquiry, job: null,
    messages: [{ id: 2, role: "customer", content: "Hello", channel: "whatsapp", createdAt: new Date("2025-01-02T00:00:00Z") }],
    attachments: [],
    calls: [{ id: 3, callStatus: "completed", transcript: null, followUpNotes: null, createdAt: new Date("2025-01-03T00:00:00Z") }],
    quotes: [],
  });
  assert.deepEqual(events.map((event) => event.id), ["enquiry:1:created", "message:2", "call:3"]);
  assert.equal(events.at(-1)?.transcriptAvailable, false);
});

test("timeline filters, orders deterministically, and pages globally", () => {
  const events = [
    { id: "b", category: "calls", occurredAt: "2025-01-02T00:00:00.000Z" },
    { id: "a", category: "messages", occurredAt: "2025-01-02T00:00:00.000Z" },
    { id: "c", category: "messages", occurredAt: "2025-01-01T00:00:00.000Z" },
  ] as any;
  const newest = paginateTimeline(events, { limit: 1, offset: 0, order: "newest" });
  assert.equal(newest.events[0].id, "a");
  assert.equal(newest.hasMore, true);
  assert.equal(newest.nextOffset, 1);
  const messages = paginateTimeline(events, { limit: 10, offset: 0, order: "oldest", category: "messages" });
  assert.deepEqual(messages.events.map((event) => event.id), ["c", "a"]);
});

test("ownership helper requires the exact parent tenant", () => {
  assert.equal(isOwnedBy({ ownerUserId: "tenant-a" }, "tenant-a"), true);
  assert.equal(isOwnedBy({ ownerUserId: "tenant-a" }, "tenant-b"), false);
  assert.equal(isOwnedBy(undefined, "tenant-a"), false);
});

test("global pagination reaches out-of-order events from a large source", () => {
  const events = Array.from({ length: 250 }, (_, index) => ({
    id: `message:${index}`,
    category: "messages",
    occurredAt: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
  })) as any;
  // A call inserted between source records must remain reachable after an offset.
  events.push({ id: "call:late", category: "calls", occurredAt: new Date(Date.UTC(2025, 0, 1, 0, 200, 30)).toISOString() });
  const page = paginateTimeline(events, { limit: 2, offset: 49, order: "newest" });
  assert.deepEqual(page.events.map((event) => event.id), ["call:late", "message:200"]);
});

test("LIMIT + 1 result helper returns the continuation offset", () => {
  assert.deepEqual(pageFetchedRows(["first", "second", "extra"], 2, 8), {
    rows: ["first", "second"], hasMore: true, nextOffset: 10,
  });
});

test("current date-only milestones are labeled as dates, not scheduling history", () => {
  const events = deriveTimelineEvents({
    enquiry, messages: [], attachments: [], calls: [], quotes: [],
    job: { id: 9, createdAt: new Date("2025-01-02T00:00:00Z"), updatedAt: new Date("2025-01-02T00:00:00Z"), status: "Survey Booked", totalWithVat: "0", siteSurveyDate: "2025-02-03", installationStartDate: null, installationEndDate: null, completedAt: null },
  });
  const milestone = events.find((event) => event.eventType === "site_survey_date");
  assert.deepEqual(milestone && { title: milestone.title, dateOnly: milestone.dateOnly, occurredAt: milestone.occurredAt }, { title: "Site survey date", dateOnly: true, occurredAt: "2025-02-03T00:00:00.000Z" });
});

test("quote links use the owning enquiry identity and null-enquiry quotes are excluded", () => {
  const events = deriveTimelineEvents({
    enquiry, job: null, messages: [], attachments: [], calls: [],
    quotes: [
      { id: 40, enquiryId: 7, documentType: "quote", createdAt: new Date("2025-03-01T00:00:00Z"), totalWithVat: "1", proposalStatus: "draft", status: "draft" },
      { id: 41, enquiryId: null, documentType: "quote", createdAt: new Date("2025-03-01T00:00:00Z"), totalWithVat: "1", proposalStatus: "draft", status: "draft" },
    ],
  });
  assert.equal(events.find((event) => event.id === "quote:40:created")?.actionHref, "/quotes/7");
  assert.equal(events.some((event) => event.id === "quote:41:created"), false);
});