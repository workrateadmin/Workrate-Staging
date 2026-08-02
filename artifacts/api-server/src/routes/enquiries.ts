import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, enquiryMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
import OpenAI from "openai";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

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

  // Sort by createdAt descending
  rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  res.json(ListEnquiriesResponse.parse(rows));
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

  res.json(GetEnquiryResponse.parse(enquiry));
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

    const [enquiry] = await db
      .select()
      .from(enquiriesTable)
      .where(eq(enquiriesTable.id, params.data.id));

    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }

    const messages = await db
      .select()
      .from(enquiryMessagesTable)
      .where(eq(enquiryMessagesTable.enquiryId, enquiry.id))
      .orderBy(enquiryMessagesTable.createdAt);

    const chatHistory = messages
      .map((m) => `${m.role === "customer" ? "Customer" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `You are an experienced trade business office assistant. Based on the following customer enquiry details and chat transcript, write a concise professional job summary for the business owner.

Customer: ${enquiry.customerName}
Email: ${enquiry.customerEmail ?? "Not provided"}
Phone: ${enquiry.customerPhone ?? "Not provided"}
Project Type: ${enquiry.projectType ?? "Not specified"}
Location: ${enquiry.location ?? "Not provided"}
Description: ${enquiry.description ?? "Not provided"}
Budget: ${enquiry.budget ?? "Not provided"}
Timescale: ${enquiry.timescale ?? "Not provided"}

${chatHistory ? `Chat Transcript:\n${chatHistory}` : ""}

Write a professional job summary (3-5 sentences) covering: the customer, the project scope, key requirements, and recommended next action (site survey, phone call, etc.). Be direct and practical.`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = completion.choices[0]?.message?.content ?? "";

    const [updated] = await db
      .update(enquiriesTable)
      .set({ aiSummary: summary })
      .where(eq(enquiriesTable.id, enquiry.id))
      .returning();

    res.json(GenerateEnquirySummaryResponse.parse(updated));
  },
);

export default router;
