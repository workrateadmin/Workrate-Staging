import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, enquiryMessagesTable, enquiryAttachmentsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import {
  ListEnquiriesQueryParams,
  ListEnquiriesResponse,
  CreateEnquiryBody,
  CreateEnquiryResponse,
  GetEnquiryParams,
  GetEnquiryResponse,
  UpdateEnquiryParams,
  UpdateEnquiryBody,
  UpdateEnquiryResponse,
  DeleteEnquiryParams,
  ListEnquiryMessagesParams,
  ListEnquiryMessagesResponse,
  GenerateEnquirySummaryParams,
  GenerateEnquirySummaryResponse,
} from "@workspace/api-zod";
import { generateAndSaveSummary } from "../utils/generate-summary.js";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};


// List enquiries
router.get("/enquiries", requireAuth, async (req, res): Promise<void> => {
  const params = ListEnquiriesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let rows = await db
    .select()
    .from(enquiriesTable)
    .orderBy(eq(enquiriesTable.status, enquiriesTable.status));

  if (params.data.status) {
    rows = rows.filter((e) => e.status === params.data.status);
  }

  rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Fetch attachment counts in one query
  const counts = await db
    .select({
      enquiryId: enquiryAttachmentsTable.enquiryId,
      cnt: count(enquiryAttachmentsTable.id),
    })
    .from(enquiryAttachmentsTable)
    .groupBy(enquiryAttachmentsTable.enquiryId);
  const countMap = new Map(counts.map((r) => [r.enquiryId, Number(r.cnt)]));

  res.json(
    ListEnquiriesResponse.parse(
      rows.map((e) => ({ ...e, attachmentCount: countMap.get(e.id) ?? 0 })),
    ),
  );
});

// Create enquiry
router.post("/enquiries", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateEnquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      ...parsed.data,
      status: parsed.data.status ?? "new_enquiry",
    })
    .returning();

  res.status(201).json(CreateEnquiryResponse.parse(enquiry));
});

// Get enquiry
router.get("/enquiries/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetEnquiryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.id, params.data.id));

  if (!enquiry) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }

  const [attachmentRow] = await db
    .select({ cnt: count(enquiryAttachmentsTable.id) })
    .from(enquiryAttachmentsTable)
    .where(eq(enquiryAttachmentsTable.enquiryId, enquiry.id));

  res.json(
    GetEnquiryResponse.parse({
      ...enquiry,
      attachmentCount: Number(attachmentRow?.cnt ?? 0),
    }),
  );
});

// Update enquiry
router.patch("/enquiries/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateEnquiryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateEnquiryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, any> = {};
  if (body.data.customerName !== undefined) updates.customerName = body.data.customerName;
  if (body.data.customerEmail !== undefined) updates.customerEmail = body.data.customerEmail;
  if (body.data.customerPhone !== undefined) updates.customerPhone = body.data.customerPhone;
  if (body.data.projectType !== undefined) updates.projectType = body.data.projectType;
  if (body.data.location !== undefined) updates.location = body.data.location;
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.budget !== undefined) updates.budget = body.data.budget;
  if (body.data.timescale !== undefined) updates.timescale = body.data.timescale;
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.aiSummary !== undefined) updates.aiSummary = body.data.aiSummary;

  const [updated] = await db
    .update(enquiriesTable)
    .set(updates)
    .where(eq(enquiriesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }

  res.json(UpdateEnquiryResponse.parse(updated));
});

// Delete enquiry
router.delete("/enquiries/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteEnquiryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(enquiriesTable)
    .where(eq(enquiriesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }

  res.sendStatus(204);
});

// List enquiry messages
router.get(
  "/enquiries/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListEnquiryMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const messages = await db
      .select()
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, params.data.id))
      .orderBy(enquiryMessagesTable.createdAt);

    res.json(ListEnquiryMessagesResponse.parse(messages));
  },
);

// Generate AI summary
router.post(
  "/enquiries/:id/generate-summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GenerateEnquirySummaryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const existing = await db
      .select({ id: enquiriesTable.id })
      .from(enquiriesTable)
      .where(eq(enquiriesTable.id, params.data.id));

    if (!existing.length) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }

    await generateAndSaveSummary(params.data.id);

    const [updated] = await db
      .select()
      .from(enquiriesTable)
      .where(eq(enquiriesTable.id, params.data.id));

    res.json(GenerateEnquirySummaryResponse.parse(updated));
  },
);

export default router;
