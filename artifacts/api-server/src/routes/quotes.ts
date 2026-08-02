import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, quotesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetQuoteParams,
  GetQuoteResponse,
  GenerateQuoteParams,
  GenerateQuoteResponse,
  UpdateQuoteParams,
  UpdateQuoteBody,
  UpdateQuoteResponse,
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

function parseQuote(q: any) {
  return {
    ...q,
    materialsAllowance: Number(q.materialsAllowance ?? 0),
    labourAllowance: Number(q.labourAllowance ?? 0),
    estimatedTotal: Number(q.estimatedTotal ?? 0),
    vatAmount: Number(q.vatAmount ?? 0),
    totalWithVat: Number(q.totalWithVat ?? 0),
  };
}

// Get quote
router.get("/enquiries/:id/quote", requireAuth, async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, params.data.id));

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(GetQuoteResponse.parse(parseQuote(quote)));
});

// Generate quote via AI
router.post("/enquiries/:id/quote", requireAuth, async (req, res): Promise<void> => {
  const params = GenerateQuoteParams.safeParse(req.params);
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

  const [company] = await db.select().from(companiesTable).limit(1);
  const labourRate = Number(company?.labourRatePerHour ?? 35);
  const markup = Number(company?.materialMarkupPercent ?? 20);

  const prompt = `You are an experienced ${company?.tradeType ?? "trade"} estimator. Generate a realistic draft quote based on the following project details.

Customer: ${enquiry.customerName}
Email: ${enquiry.customerEmail ?? "Not provided"}
Phone: ${enquiry.customerPhone ?? "Not provided"}
Project: ${enquiry.projectType ?? "General trade work"}
Location: ${enquiry.location ?? "Not provided"}
Description: ${enquiry.description ?? "Not provided"}
Budget: ${enquiry.budget ?? "Not provided"}
Timescale: ${enquiry.timescale ?? "Not provided"}
Company Labour Rate: £${labourRate}/hour
Material Markup: ${markup}%

Return ONLY a valid JSON object with these exact fields (numbers as integers or decimals, no currency symbols):
{
  "projectDescription": "detailed project description",
  "materialsAllowance": 0,
  "labourAllowance": 0,
  "notes": "any important notes about the quote",
  "assumptions": "key assumptions made in this estimate"
}

Be realistic and professional. Base estimates on typical UK trade rates and material costs.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  let aiData: any = {};
  try {
    aiData = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    aiData = {};
  }

  const materialsAllowance = Number(aiData.materialsAllowance ?? 0);
  const labourAllowance = Number(aiData.labourAllowance ?? 0);
  const estimatedTotal = materialsAllowance + labourAllowance;
  const vatAmount = Math.round(estimatedTotal * 0.2 * 100) / 100;
  const totalWithVat = Math.round((estimatedTotal + vatAmount) * 100) / 100;

  // Delete existing quote if any
  await db.delete(quotesTable).where(eq(quotesTable.enquiryId, enquiry.id));

  const [quote] = await db
    .insert(quotesTable)
    .values({
      enquiryId: enquiry.id,
      customerDetails: `${enquiry.customerName}${enquiry.customerEmail ? ` | ${enquiry.customerEmail}` : ""}${enquiry.customerPhone ? ` | ${enquiry.customerPhone}` : ""}`,
      projectDescription: aiData.projectDescription ?? enquiry.description ?? "",
      materialsAllowance: materialsAllowance.toString(),
      labourAllowance: labourAllowance.toString(),
      estimatedTotal: estimatedTotal.toString(),
      vatAmount: vatAmount.toString(),
      totalWithVat: totalWithVat.toString(),
      notes: aiData.notes ?? "",
      assumptions: aiData.assumptions ?? "",
      status: "draft",
    })
    .returning();

  res.status(201).json(GenerateQuoteResponse.parse(parseQuote(quote)));
});

// Update quote
router.patch("/enquiries/:id/quote", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateQuoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const updates: Record<string, any> = {};
  if (body.data.customerDetails !== undefined) updates.customerDetails = body.data.customerDetails;
  if (body.data.projectDescription !== undefined) updates.projectDescription = body.data.projectDescription;
  if (body.data.materialsAllowance !== undefined) updates.materialsAllowance = body.data.materialsAllowance.toString();
  if (body.data.labourAllowance !== undefined) updates.labourAllowance = body.data.labourAllowance.toString();
  if (body.data.estimatedTotal !== undefined) updates.estimatedTotal = body.data.estimatedTotal.toString();
  if (body.data.vatAmount !== undefined) updates.vatAmount = body.data.vatAmount.toString();
  if (body.data.totalWithVat !== undefined) updates.totalWithVat = body.data.totalWithVat.toString();
  if (body.data.notes !== undefined) updates.notes = body.data.notes;
  if (body.data.assumptions !== undefined) updates.assumptions = body.data.assumptions;
  if (body.data.status !== undefined) updates.status = body.data.status;

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(eq(quotesTable.enquiryId, params.data.id))
    .returning();

  res.json(UpdateQuoteResponse.parse(parseQuote(updated)));
});

export default router;
