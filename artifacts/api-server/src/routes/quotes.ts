import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, quotesTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
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
    depositPercent: q.depositPercent != null ? Number(q.depositPercent) : null,
    depositFixed: q.depositFixed != null ? Number(q.depositFixed) : null,
    depositAmount: q.depositAmount != null ? Number(q.depositAmount) : null,
    remainingBalance: q.remainingBalance != null ? Number(q.remainingBalance) : null,
    depositPaidAmount: q.depositPaidAmount != null ? Number(q.depositPaidAmount) : null,
  };
}

/** Generate a unique proposal token */
function generateProposalToken(): string {
  return randomBytes(20).toString("base64url");
}

/** Calculate deposit amount from company settings and total */
function calcDeposit(
  total: number,
  depositType: string,
  depositPercent: number | null,
  depositFixed: number | null,
): { depositAmount: number; remainingBalance: number } {
  if (depositType === "none") {
    return { depositAmount: 0, remainingBalance: total };
  }
  if (depositType === "fixed" && depositFixed != null) {
    const dep = Math.min(depositFixed, total);
    return { depositAmount: Math.round(dep * 100) / 100, remainingBalance: Math.round((total - dep) * 100) / 100 };
  }
  // percentage (default)
  const pct = depositPercent ?? 50;
  const dep = Math.round(total * (pct / 100) * 100) / 100;
  return { depositAmount: dep, remainingBalance: Math.round((total - dep) * 100) / 100 };
}

/** Snapshot current company branding so historical quotes retain their design. */
async function snapshotBranding(userId: string): Promise<string | null> {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .limit(1);
  if (!company) return null;
  return JSON.stringify({
    documentMode: company.documentMode ?? "workrate",
    name: company.name,
    address: company.address,
    phone: company.phone,
    email: company.email,
    website: (company as any).website,
    companyRegNumber: (company as any).companyRegNumber,
    vatNumber: (company as any).vatNumber,
    bankPaymentDetails: (company as any).bankPaymentDetails,
    brandColourPrimary: (company as any).brandColourPrimary,
    brandColourSecondary: (company as any).brandColourSecondary,
    paymentTerms: (company as any).paymentTerms,
    termsAndConditions: (company as any).termsAndConditions,
    quoteFooter: (company as any).quoteFooter,
    invoiceFooter: (company as any).invoiceFooter,
    logoUrl: company.logoUrl,
  });
}

// Get quote
router.get("/enquiries/:id/quote", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify enquiry ownership
  const [enquiry] = await db
    .select({ id: enquiriesTable.id })
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, params.data.id), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

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
  const { userId } = getAuth(req);
  const params = GenerateQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, params.data.id), eq(enquiriesTable.ownerUserId, userId!)));

  if (!enquiry) {
    res.status(404).json({ error: "Enquiry not found" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);
  const labourRate = Number(company?.labourRatePerHour ?? 35);
  const markup = Number(company?.materialMarkupPercent ?? 20);

  const dayRate = Number(company?.dayRate ?? 0);
  const minValue = Number(company?.minimumProjectValue ?? 0);

  // Build Brain context
  const brainLines: string[] = [
    `Trade: ${company?.tradeType ?? "General trade"}`,
    `Labour rate: £${labourRate}/hr${dayRate > 0 ? `, £${dayRate}/day` : ""}`,
    `Materials markup: ${markup}%`,
  ];
  if (minValue > 0) brainLines.push(`Minimum project value: £${minValue} — do not quote below this`);
  if (company?.serviceArea) brainLines.push(`Service area: ${company.serviceArea}`);
  if (company?.preferredSuppliers) brainLines.push(`Preferred suppliers (use for material sourcing): ${company.preferredSuppliers}`);
  if (company?.typicalLeadTimes) brainLines.push(`Typical lead times: ${company.typicalLeadTimes}`);

  const prompt = `You are an experienced ${company?.tradeType ?? "trade"} estimator based in the UK. Generate a realistic draft quote based on the following project details.

Business settings (WorkRate Brain):
${brainLines.join("\n")}

Customer: ${enquiry.customerName}
Email: ${enquiry.customerEmail ?? "Not provided"}
Phone: ${enquiry.customerPhone ?? "Not provided"}
Project: ${enquiry.projectType ?? "General trade work"}
Location: ${enquiry.location ?? "Not provided"}
Description: ${enquiry.description ?? "Not provided"}
AI Summary: ${enquiry.aiSummary ? (() => { try { const s = JSON.parse(enquiry.aiSummary!); return `${s.summary ?? ""} Measurements: ${s.measurements ?? ""}. Materials: ${s.materials ?? ""}.`; } catch { return enquiry.aiSummary!; } })() : "Not available"}
Budget: ${enquiry.budget ?? "Not provided"}
Timescale: ${enquiry.timescale ?? "Not provided"}

Return ONLY a valid JSON object with these exact fields (numbers as integers or decimals, no currency symbols):
{
  "projectDescription": "detailed project description covering scope and key deliverables",
  "materialsAllowance": 0,
  "labourAllowance": 0,
  "notes": "important notes — include lead time if relevant",
  "assumptions": "key assumptions made in this estimate"
}

Use the business settings to set labour rates. Apply the materials markup to your cost-price estimates. Ensure the total does not fall below the minimum project value if set. Be realistic and professional.`;

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
  const { userId } = getAuth(req);
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

  // Verify enquiry ownership
  const [enquiry] = await db
    .select({ id: enquiriesTable.id })
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, params.data.id), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

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

  // Snapshot branding the first time a quote is sent/accepted so historical
  // quotes always render with the design they had at the time of sending.
  if (
    body.data.status === "sent" || body.data.status === "accepted"
  ) {
    const snap = await snapshotBranding(userId!);
    if (snap && !existing.brandingSnapshot) {
      updates.brandingSnapshot = snap;
    }
  }

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(eq(quotesTable.enquiryId, params.data.id))
    .returning();

  res.json(UpdateQuoteResponse.parse(parseQuote(updated)));
});

// Approve & Send — tradesperson approves the quote and sends it as a proposal
router.post("/enquiries/:id/quote/approve-and-send", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid enquiry id" }); return; }

  // Verify ownership
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  // Load company deposit settings
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  const depositType = company?.defaultDepositType ?? "percentage";
  const depositPercent = company?.defaultDepositPercent ? Number(company.defaultDepositPercent) : 50;
  const depositFixed = company?.defaultDepositFixed ? Number(company.defaultDepositFixed) : null;

  const total = Number(existing.totalWithVat);
  const { depositAmount, remainingBalance } = calcDeposit(total, depositType, depositPercent, depositFixed);

  // Generate unique token
  const token = generateProposalToken();

  // Snapshot branding now (before customer sees it)
  const snap = await snapshotBranding(userId!);

  const [updated] = await db
    .update(quotesTable)
    .set({
      proposalStatus: "sent",
      proposalToken: token,
      depositType,
      depositPercent: depositPercent.toString(),
      depositFixed: depositFixed != null ? depositFixed.toString() : null,
      depositAmount: depositAmount.toString(),
      remainingBalance: remainingBalance.toString(),
      status: "sent",
      brandingSnapshot: snap ?? existing.brandingSnapshot,
    })
    .where(eq(quotesTable.enquiryId, id))
    .returning();

  // Update enquiry status to quote_sent
  await db
    .update(enquiriesTable)
    .set({ status: "quote_sent" })
    .where(eq(enquiriesTable.id, id));

  res.json(parseQuote(updated));
});

// Mark deposit as paid — tradesperson confirms receipt
router.post("/enquiries/:id/quote/mark-deposit-paid", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid enquiry id" }); return; }

  const amount = Number(req.body?.amount);
  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  // Verify ownership
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  const total = Number(existing.totalWithVat);
  const remaining = Math.max(0, Math.round((total - amount) * 100) / 100);

  const [updated] = await db
    .update(quotesTable)
    .set({
      proposalStatus: "deposit_paid",
      depositPaidAt: new Date(),
      depositPaidAmount: amount.toString(),
      remainingBalance: remaining.toString(),
      status: "accepted",
    })
    .where(eq(quotesTable.enquiryId, id))
    .returning();

  res.json(parseQuote(updated));
});

export default router;
