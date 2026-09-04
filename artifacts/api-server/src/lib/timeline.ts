import {
  aiCallsTable,
  db,
  enquiriesTable,
  enquiryAttachmentsTable,
  enquiryMessagesTable,
  jobsTable,
  quotesTable,
} from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";

export const timelineCategories = ["messages", "calls", "quotes", "jobs", "invoices_payments"] as const;
export type TimelineCategory = typeof timelineCategories[number];
export type TimelineOrder = "newest" | "oldest";

export type TimelineEvent = {
  id: string;
  category: TimelineCategory;
  eventType: string;
  occurredAt: string;
  title: string;
  detail: string | null;
  channel: string | null;
  amount: number | null;
  status: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  /** True when occurredAt represents a calendar date, not an instant. */
  dateOnly?: boolean | null;
  transcriptAvailable?: boolean | null;
  attachment?: { filename: string; mimetype: string; fileSize: number | null } | null;
};

export const isOwnedBy = (record: { ownerUserId: string | null } | undefined, userId: string): boolean =>
  record?.ownerUserId === userId;

type TimelineInputs = {
  enquiry: any;
  job?: any | null;
  messages: any[];
  attachments: any[];
  calls: any[];
  quotes: any[];
};

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const dateIso = (value: string): string => `${value}T00:00:00.000Z`;
const amount = (value: unknown): number | null => value == null ? null : Number(value);

/** Maps only timestamps and relationships that are explicitly stored in the database. */
export function deriveTimelineEvents(input: TimelineInputs): TimelineEvent[] {
  const { enquiry, job, messages, attachments, calls, quotes } = input;
  const enquiryHref = `/enquiries/${enquiry.id}`;
  const events: TimelineEvent[] = [{
    id: `enquiry:${enquiry.id}:created`,
    category: "messages",
    eventType: "enquiry_created",
    occurredAt: iso(enquiry.createdAt),
    title: "Enquiry created",
    detail: enquiry.projectType ?? null,
    channel: enquiry.channel ?? null,
    amount: null, status: enquiry.status, actionLabel: "View enquiry", actionHref: enquiryHref,
  }];
  for (const message of messages) events.push({
    id: `message:${message.id}`, category: "messages", eventType: message.role === "customer" ? "customer_message" : "assistant_message",
    occurredAt: iso(message.createdAt), title: message.role === "customer" ? "Customer message" : "Assistant message",
    detail: message.content, channel: message.channel ?? null, amount: null, status: null, actionLabel: "View enquiry", actionHref: enquiryHref,
  });
  for (const attachment of attachments) events.push({
    id: `attachment:${attachment.id}`, category: "messages", eventType: "attachment_uploaded", occurredAt: iso(attachment.uploadedAt),
    title: "Attachment uploaded", detail: attachment.filename, channel: null, amount: null, status: null,
    actionLabel: "View attachments", actionHref: enquiryHref,
    attachment: { filename: attachment.filename, mimetype: attachment.mimetype, fileSize: attachment.fileSize ?? null },
  });
  for (const call of calls) events.push({
    id: `call:${call.id}`, category: "calls", eventType: "call_completed", occurredAt: iso(call.callEndedAt ?? call.callStartedAt ?? call.createdAt),
    title: "AI receptionist call", detail: call.followUpNotes ?? null, channel: "phone", amount: null, status: call.callStatus,
    actionLabel: "View enquiry", actionHref: enquiryHref, transcriptAvailable: Boolean(call.transcript),
  });
  for (const quote of quotes.filter((row) => row.documentType !== "invoice" && row.enquiryId != null)) {
    const href = `/quotes/${quote.enquiryId}`;
    events.push({ id: `quote:${quote.id}:created`, category: "quotes", eventType: "quote_created", occurredAt: iso(quote.createdAt), title: "Quote created", detail: quote.projectDescription ?? null, channel: null, amount: amount(quote.totalWithVat), status: quote.proposalStatus ?? quote.status, actionLabel: "View quote", actionHref: href });
    if (quote.emailSentAt) events.push({ id: `quote:${quote.id}:sent`, category: "quotes", eventType: "quote_sent", occurredAt: iso(quote.emailSentAt), title: "Quote sent", detail: null, channel: "email", amount: amount(quote.totalWithVat), status: quote.emailDeliveryStatus, actionLabel: "View quote", actionHref: href });
    if (quote.viewedAt) events.push({ id: `quote:${quote.id}:viewed`, category: "quotes", eventType: "quote_viewed", occurredAt: iso(quote.viewedAt), title: "Quote viewed", detail: null, channel: null, amount: amount(quote.totalWithVat), status: quote.proposalStatus, actionLabel: "View quote", actionHref: href });
    if (quote.acceptedAt) events.push({ id: `quote:${quote.id}:accepted`, category: "quotes", eventType: "quote_accepted", occurredAt: iso(quote.acceptedAt), title: "Quote accepted", detail: null, channel: null, amount: amount(quote.totalWithVat), status: quote.proposalStatus, actionLabel: "View quote", actionHref: href });
    if (quote.depositPaidAt) events.push({ id: `quote:${quote.id}:deposit_paid`, category: "invoices_payments", eventType: "deposit_received", occurredAt: iso(quote.depositPaidAt), title: "Deposit received", detail: null, channel: null, amount: amount(quote.depositPaidAmount ?? quote.depositAmount), status: null, actionLabel: "View quote", actionHref: href });
  }
  if (job) {
    const href = `/jobs/${job.id}`;
    events.push({ id: `job:${job.id}:created`, category: "jobs", eventType: "job_created", occurredAt: iso(job.createdAt), title: "Job created", detail: null, channel: null, amount: amount(job.totalWithVat), status: job.status, actionLabel: "View job", actionHref: href });
    for (const [eventType, title, value] of [["site_survey_date", "Site survey date", job.siteSurveyDate], ["installation_start_date", "Installation start date", job.installationStartDate], ["installation_end_date", "Installation end date", job.installationEndDate]] as const) if (value) events.push({ id: `job:${job.id}:${eventType}`, category: "jobs", eventType, occurredAt: dateIso(value), dateOnly: true, title, detail: null, channel: null, amount: null, status: job.status, actionLabel: "View job", actionHref: href });
    if (job.completedAt) events.push({ id: `job:${job.id}:completion_date`, category: "jobs", eventType: "job_completion_date", occurredAt: dateIso(job.completedAt), dateOnly: true, title: "Job completion date", detail: job.completionNotes ?? null, channel: null, amount: amount(job.finalAmountCharged), status: "Completed", actionLabel: "View job", actionHref: href });
  }
  for (const invoice of quotes.filter((row) => row.documentType === "invoice")) {
    const href = `/invoices/${invoice.id}`;
    events.push({ id: `invoice:${invoice.id}:created`, category: "invoices_payments", eventType: "invoice_created", occurredAt: iso(invoice.createdAt), title: "Invoice created", detail: invoice.invoiceNumber ?? null, channel: null, amount: amount(invoice.totalWithVat), status: invoice.status, actionLabel: "View invoice", actionHref: href });
    if (invoice.emailSentAt) events.push({ id: `invoice:${invoice.id}:sent`, category: "invoices_payments", eventType: "invoice_sent", occurredAt: iso(invoice.emailSentAt), title: "Invoice sent", detail: invoice.invoiceNumber ?? null, channel: "email", amount: amount(invoice.totalWithVat), status: invoice.emailDeliveryStatus, actionLabel: "View invoice", actionHref: href });
    if (invoice.paidAt) events.push({ id: `invoice:${invoice.id}:paid`, category: "invoices_payments", eventType: "invoice_paid", occurredAt: iso(invoice.paidAt), title: "Invoice paid", detail: invoice.invoiceNumber ?? null, channel: null, amount: amount(invoice.totalWithVat), status: "paid", actionLabel: "View invoice", actionHref: href });
    if (!invoice.paidAt && invoice.dueDate && new Date(`${invoice.dueDate}T00:00:00Z`) < new Date()) events.push({ id: `invoice:${invoice.id}:overdue`, category: "invoices_payments", eventType: "invoice_overdue", occurredAt: dateIso(invoice.dueDate), dateOnly: true, title: "Invoice overdue", detail: invoice.invoiceNumber ?? null, channel: null, amount: amount(invoice.totalWithVat), status: invoice.status, actionLabel: "View invoice", actionHref: href });
  }
  return events;
}

export function paginateTimeline(events: TimelineEvent[], options: { limit: number; offset: number; order: TimelineOrder; category?: TimelineCategory }): { events: TimelineEvent[]; hasMore: boolean; nextOffset: number | null } {
  const filtered = options.category ? events.filter((event) => event.category === options.category) : events;
  filtered.sort((a, b) => {
    const difference = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    return (options.order === "oldest" ? difference : -difference) || a.id.localeCompare(b.id);
  });
  const page = filtered.slice(options.offset, options.offset + options.limit);
  const hasMore = options.offset + page.length < filtered.length;
  return { events: page, hasMore, nextOffset: hasMore ? options.offset + page.length : null };
}

/** Applies the LIMIT + 1 contract returned by the database event CTE. */
export function pageFetchedRows<T>(rows: T[], limit: number, offset: number): { rows: T[]; hasMore: boolean; nextOffset: number | null } {
  const hasMore = rows.length > limit;
  return { rows: rows.slice(0, limit), hasMore, nextOffset: hasMore ? offset + limit : null };
}

export async function findOwnedEnquiry(id: number, userId: string) {
  const [enquiry] = await db.select().from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId))).limit(1);
  return enquiry ?? null;
}

/** Job access is deliberately resolved through its enquiry, not a copied job field. */
export async function findOwnedJob(id: number, userId: string) {
  const [row] = await db.select({ job: jobsTable, enquiry: enquiriesTable })
    .from(jobsTable)
    .innerJoin(enquiriesTable, eq(jobsTable.enquiryId, enquiriesTable.id))
    .where(and(eq(jobsTable.id, id), eq(enquiriesTable.ownerUserId, userId))).limit(1);
  return row ?? null;
}

export async function findJobForOwnedEnquiry(enquiryId: number) {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.enquiryId, enquiryId)).limit(1);
  return job ?? null;
}

/**
 * Each source is loaded in one tenant-authorized query and normalized before a
 * single global sort/slice.  We intentionally do not truncate source rows:
 * one quote can produce events at several independent timestamps, so a
 * row-level limit cannot prove that a later quote event is reachable. This
 * keeps pagination globally correct without inventing a timeline table.
 */
export async function loadTimeline(enquiry: any, job: any | null) {
  const invoiceWhere = job ? or(eq(quotesTable.enquiryId, enquiry.id), eq(quotesTable.jobId, job.id)) : eq(quotesTable.enquiryId, enquiry.id);
  const [messages, attachments, calls, quotes] = await Promise.all([
    db.select().from(enquiryMessagesTable).where(eq(enquiryMessagesTable.enquiryId, enquiry.id)).orderBy(enquiryMessagesTable.createdAt, enquiryMessagesTable.id),
    db.select().from(enquiryAttachmentsTable).where(eq(enquiryAttachmentsTable.enquiryId, enquiry.id)).orderBy(enquiryAttachmentsTable.uploadedAt, enquiryAttachmentsTable.id),
    db.select().from(aiCallsTable).where(eq(aiCallsTable.enquiryId, enquiry.id)).orderBy(aiCallsTable.createdAt, aiCallsTable.id),
    db.select().from(quotesTable).where(invoiceWhere).orderBy(quotesTable.createdAt, quotesTable.id),
  ]);
  return deriveTimelineEvents({ enquiry, job, messages, attachments, calls, quotes });
}

/**
 * Incremental production reader. The CTE normalizes each persisted lifecycle
 * timestamp into one row, then PostgreSQL applies the category predicate and
 * global stable ordering before LIMIT + 1/OFFSET. No relationship collection
 * is materialized in Node.
 */
export async function loadTimelinePageFromDatabase(input: {
  enquiryId: number; jobId: number | null; userId: string; limit: number; offset: number;
  order: TimelineOrder; category?: TimelineCategory;
}): Promise<{ events: TimelineEvent[]; hasMore: boolean; nextOffset: number | null }> {
  const direction = input.order === "oldest" ? sql`ASC` : sql`DESC`;
  const result = await db.execute(sql`
    WITH authorized AS (
      SELECT e.id FROM enquiries e WHERE e.id = ${input.enquiryId} AND e.owner_user_id = ${input.userId}
    ), scoped_quotes AS (
      SELECT q.* FROM quotes q JOIN authorized a ON q.enquiry_id = a.id
      UNION
      SELECT q.* FROM quotes q
      WHERE q.job_id = ${input.jobId}::integer AND q.owner_user_id = ${input.userId}
    ), events AS (
      SELECT 'enquiry:' || e.id || ':created' id, 'messages' category, 'enquiry_created' "eventType",
        e.created_at "occurredAt", 'Enquiry created' title, e.project_type detail, e.channel channel,
        NULL::numeric amount, e.status status, 'View enquiry' "actionLabel", '/enquiries/' || e.id "actionHref",
        NULL::boolean "transcriptAvailable", NULL::text filename, NULL::text mimetype, NULL::integer "fileSize", NULL::boolean "dateOnly"
      FROM enquiries e JOIN authorized a ON a.id = e.id
      UNION ALL
      SELECT 'message:' || m.id, 'messages', CASE WHEN m.role = 'customer' THEN 'customer_message' ELSE 'assistant_message' END,
        m.created_at, CASE WHEN m.role = 'customer' THEN 'Customer message' ELSE 'Assistant message' END, m.content, m.channel,
        NULL::numeric, NULL::text, 'View enquiry', '/enquiries/' || m.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM enquiry_messages m JOIN authorized a ON a.id = m.enquiry_id
      UNION ALL
      SELECT 'attachment:' || a.id, 'messages', 'attachment_uploaded', a.uploaded_at, 'Attachment uploaded', a.filename, NULL::text,
        NULL::numeric, NULL::text, 'View attachments', '/enquiries/' || a.enquiry_id, NULL::boolean, a.filename, a.mimetype, a.file_size, NULL::boolean
      FROM enquiry_attachments a JOIN authorized auth ON auth.id = a.enquiry_id
      UNION ALL
      SELECT 'call:' || c.id, 'calls', 'call_completed', COALESCE(c.call_ended_at, c.call_started_at, c.created_at), 'AI receptionist call', c.follow_up_notes, 'phone',
        NULL::numeric, c.call_status, 'View enquiry', '/enquiries/' || c.enquiry_id, (c.transcript IS NOT NULL), NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM ai_calls c JOIN authorized a ON a.id = c.enquiry_id
      UNION ALL
      SELECT 'quote:' || q.id || ':created', 'quotes', 'quote_created', q.created_at, 'Quote created', q.project_description, NULL::text,
        q.total_with_vat, COALESCE(q.proposal_status, q.status), 'View quote', '/quotes/' || q.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type <> 'invoice' AND q.enquiry_id IS NOT NULL
      UNION ALL
      SELECT 'quote:' || q.id || ':sent', 'quotes', 'quote_sent', q.email_sent_at, 'Quote sent', NULL::text, 'email', q.total_with_vat, q.email_delivery_status, 'View quote', '/quotes/' || q.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type <> 'invoice' AND q.enquiry_id IS NOT NULL AND q.email_sent_at IS NOT NULL
      UNION ALL
      SELECT 'quote:' || q.id || ':viewed', 'quotes', 'quote_viewed', q.viewed_at, 'Quote viewed', NULL::text, NULL::text, q.total_with_vat, q.proposal_status, 'View quote', '/quotes/' || q.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type <> 'invoice' AND q.enquiry_id IS NOT NULL AND q.viewed_at IS NOT NULL
      UNION ALL
      SELECT 'quote:' || q.id || ':accepted', 'quotes', 'quote_accepted', q.accepted_at, 'Quote accepted', NULL::text, NULL::text, q.total_with_vat, q.proposal_status, 'View quote', '/quotes/' || q.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type <> 'invoice' AND q.enquiry_id IS NOT NULL AND q.accepted_at IS NOT NULL
      UNION ALL
      SELECT 'quote:' || q.id || ':deposit_paid', 'invoices_payments', 'deposit_received', q.deposit_paid_at, 'Deposit received', NULL::text, NULL::text, COALESCE(q.deposit_paid_amount, q.deposit_amount), NULL::text, 'View quote', '/quotes/' || q.enquiry_id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type <> 'invoice' AND q.enquiry_id IS NOT NULL AND q.deposit_paid_at IS NOT NULL
      UNION ALL
      SELECT 'job:' || j.id || ':created', 'jobs', 'job_created', j.created_at, 'Job created', NULL::text, NULL::text, j.total_with_vat, j.status, 'View job', '/jobs/' || j.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM jobs j JOIN authorized a ON a.id = j.enquiry_id WHERE ${input.jobId}::integer IS NULL OR j.id = ${input.jobId}
      UNION ALL
      SELECT 'job:' || j.id || ':site_survey_date', 'jobs', 'site_survey_date', j.site_survey_date::timestamp AT TIME ZONE 'UTC', 'Site survey date', NULL::text, NULL::text, NULL::numeric, j.status, 'View job', '/jobs/' || j.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, true
      FROM jobs j JOIN authorized a ON a.id = j.enquiry_id WHERE j.site_survey_date IS NOT NULL AND (${input.jobId}::integer IS NULL OR j.id = ${input.jobId})
      UNION ALL
      SELECT 'job:' || j.id || ':installation_start_date', 'jobs', 'installation_start_date', j.installation_start_date::timestamp AT TIME ZONE 'UTC', 'Installation start date', NULL::text, NULL::text, NULL::numeric, j.status, 'View job', '/jobs/' || j.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, true
      FROM jobs j JOIN authorized a ON a.id = j.enquiry_id WHERE j.installation_start_date IS NOT NULL AND (${input.jobId}::integer IS NULL OR j.id = ${input.jobId})
      UNION ALL
      SELECT 'job:' || j.id || ':installation_end_date', 'jobs', 'installation_end_date', j.installation_end_date::timestamp AT TIME ZONE 'UTC', 'Installation end date', NULL::text, NULL::text, NULL::numeric, j.status, 'View job', '/jobs/' || j.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, true
      FROM jobs j JOIN authorized a ON a.id = j.enquiry_id WHERE j.installation_end_date IS NOT NULL AND (${input.jobId}::integer IS NULL OR j.id = ${input.jobId})
      UNION ALL
      SELECT 'job:' || j.id || ':completion_date', 'jobs', 'job_completion_date', j.completed_at::timestamp AT TIME ZONE 'UTC', 'Job completion date', j.completion_notes, NULL::text, j.final_amount_charged, 'Completed', 'View job', '/jobs/' || j.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, true
      FROM jobs j JOIN authorized a ON a.id = j.enquiry_id WHERE j.completed_at IS NOT NULL AND (${input.jobId}::integer IS NULL OR j.id = ${input.jobId})
      UNION ALL
      SELECT 'invoice:' || q.id || ':created', 'invoices_payments', 'invoice_created', q.created_at, 'Invoice created', q.invoice_number, NULL::text, q.total_with_vat, q.status, 'View invoice', '/invoices/' || q.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type = 'invoice'
      UNION ALL
      SELECT 'invoice:' || q.id || ':sent', 'invoices_payments', 'invoice_sent', q.email_sent_at, 'Invoice sent', q.invoice_number, 'email', q.total_with_vat, q.email_delivery_status, 'View invoice', '/invoices/' || q.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type = 'invoice' AND q.email_sent_at IS NOT NULL
      UNION ALL
      SELECT 'invoice:' || q.id || ':paid', 'invoices_payments', 'invoice_paid', q.paid_at, 'Invoice paid', q.invoice_number, NULL::text, q.total_with_vat, 'paid', 'View invoice', '/invoices/' || q.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, NULL::boolean
      FROM scoped_quotes q WHERE q.document_type = 'invoice' AND q.paid_at IS NOT NULL
      UNION ALL
      SELECT 'invoice:' || q.id || ':overdue', 'invoices_payments', 'invoice_overdue', q.due_date::timestamp AT TIME ZONE 'UTC', 'Invoice overdue', q.invoice_number, NULL::text, q.total_with_vat, q.status, 'View invoice', '/invoices/' || q.id, NULL::boolean, NULL::text, NULL::text, NULL::integer, true
      FROM scoped_quotes q WHERE q.document_type = 'invoice' AND q.paid_at IS NULL AND q.due_date IS NOT NULL AND q.due_date::date < CURRENT_DATE
    )
    SELECT * FROM events WHERE ${input.category ?? null}::text IS NULL OR category = ${input.category ?? null}
    ORDER BY "occurredAt" ${direction}, id ASC LIMIT ${input.limit + 1} OFFSET ${input.offset}
  `);
  const rows = (result as any).rows as any[];
  const page = pageFetchedRows(rows, input.limit, input.offset);
  return {
    events: page.rows.map((row) => ({
      ...row, occurredAt: iso(row.occurredAt), amount: amount(row.amount),
      attachment: row.filename ? { filename: row.filename, mimetype: row.mimetype, fileSize: row.fileSize } : null,
    })),
    hasMore: page.hasMore, nextOffset: page.nextOffset,
  };
}