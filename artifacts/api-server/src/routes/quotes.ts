import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, quotesTable, companiesTable } from "@workspace/db";
import { sendProposalEmail } from "../services/customer-comms";
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

/**
 * Public URL used in customer proposal emails.
 *
 * A configured public URL must win over REPLIT_DEV_DOMAIN: the latter is only
 * suitable for workspace previews and creates broken links in production email.
 */
function getProposalBaseUrl(): string {
  const configuredUrl = process.env.PROPOSAL_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  return devDomain ? `https://${devDomain}` : "";
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
    depositPaymentInstructions: (company as any).depositPaymentInstructions,
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

  // Build the AI summary section — use ALL fields the chat AI captured, not just 3
  const aiSummarySection = enquiry.aiSummary ? (() => {
    try {
      const s = JSON.parse(enquiry.aiSummary!);
      const lines: string[] = ["What the customer confirmed (from enquiry chat):"];
      if (s.project)                lines.push(`  Project: ${s.project}`);
      if (s.measurements)           lines.push(`  Measurements: ${s.measurements}`);
      if (s.materials)              lines.push(`  Materials/finish: ${s.materials}`);
      if (s.customerRequirements)   lines.push(`  Customer requirements: ${s.customerRequirements}`);
      if (s.summary)                lines.push(`  Summary: ${s.summary}`);
      if (s.potentialChallenges)    lines.push(`  Potential challenges: ${s.potentialChallenges}`);
      if (s.recommendedNextAction)  lines.push(`  Recommended next action: ${s.recommendedNextAction}`);
      return lines.join("\n");
    } catch {
      return `AI Summary: ${enquiry.aiSummary}`;
    }
  })() : "No structured summary available — work from Description only.";

  const prompt = `You are an experienced ${company?.tradeType ?? "trade"} estimator based in the UK. Generate a realistic draft quote based only on the confirmed project details below.

Business settings (WorkRate Brain):
${brainLines.join("\n")}

Customer: ${enquiry.customerName}
Email: ${enquiry.customerEmail ?? "Not provided"}
Phone: ${enquiry.customerPhone ?? "Not provided"}
Project type: ${enquiry.projectType ?? "General trade work"}
Location: ${enquiry.location ?? "Not provided"}
Budget: ${enquiry.budget ?? "Not provided"}
Timescale: ${enquiry.timescale ?? "Not provided"}

Description (from enquiry):
${enquiry.description ?? "Not provided"}

${aiSummarySection}

Rules — follow these exactly:
1. Only describe scope, dimensions, materials, and quantities that the customer has explicitly stated above.
2. Do not invent or assume any dimensions, quantities, or finishes not mentioned by the customer. If a detail is unknown, write [TBC] in projectDescription and add a "Missing — [what is needed]" line in assumptions.
3. Where the customer has left a material choice open (e.g. said "painted" but not which substrate), you may note the trade-appropriate default as "Assumed — [reason]" in assumptions — but do not present it as confirmed in projectDescription.
4. Apply the labour rate and materials markup from Business settings. Ensure the total does not fall below the minimum project value if set.

Return ONLY a valid JSON object with these exact fields (numbers as integers or decimals, no currency symbols):
{
  "projectDescription": "scope of works using only what the customer confirmed; mark any unknown details as [TBC]",
  "materialsAllowance": 0,
  "labourAllowance": 0,
  "notes": "important notes — include lead time if relevant",
  "assumptions": "gaps prefixed Missing — and trade defaults prefixed Assumed — ; leave blank if everything is confirmed"
}`;

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

  // Send proposal email to customer (fire-and-forget — never fails the request)
  Promise.resolve().then(async () => {
    try {
      const proposalBaseUrl = getProposalBaseUrl();

      await sendProposalEmail(
        updated.id,
        {
          customerName: enquiry.customerName,
          customerEmail: enquiry.customerEmail ?? null,
          projectType: enquiry.projectType ?? null,
          totalWithVat: Number(updated.totalWithVat),
          depositAmount: updated.depositAmount != null ? Number(updated.depositAmount) : null,
          proposalToken: token,
          proposalBaseUrl,
        },
        {
          name: company?.name ?? "Your tradesperson",
          email: company?.email ?? null,
          phone: company?.phone ?? null,
          website: company?.website ?? null,
          logoUrl: company?.logoUrl ?? null,
          brandColourPrimary: company?.brandColourPrimary ?? null,
          notificationsFromEmail: company?.notificationsFromEmail ?? null,
          proposalEmailEnabled: company?.proposalEmailEnabled ?? true,
        }
      );
    } catch (err) {
      console.error("[comms] proposal email failed:", err);
    }
  });

  res.json(parseQuote(updated));
});

// Re-send proposal email — retry on failure or resend to customer
router.post("/enquiries/:id/quote/resend-proposal-email", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid enquiry id" }); return; }

  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, id), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  const [existing] = await db.select().from(quotesTable).where(eq(quotesTable.enquiryId, id));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (!existing.proposalToken) { res.status(400).json({ error: "Proposal not yet approved" }); return; }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  const proposalBaseUrl = getProposalBaseUrl();

  // Clear previous error before resend
  await db.update(quotesTable)
    .set({ emailDeliveryStatus: "pending", emailError: null })
    .where(eq(quotesTable.enquiryId, id));

  await sendProposalEmail(
    existing.id,
    {
      customerName: enquiry.customerName,
      customerEmail: enquiry.customerEmail ?? null,
      projectType: enquiry.projectType ?? null,
      totalWithVat: Number(existing.totalWithVat),
      depositAmount: existing.depositAmount != null ? Number(existing.depositAmount) : null,
      proposalToken: existing.proposalToken,
      proposalBaseUrl,
    },
    {
      name: company?.name ?? "Your tradesperson",
      email: company?.email ?? null,
      phone: company?.phone ?? null,
      website: company?.website ?? null,
      logoUrl: company?.logoUrl ?? null,
      brandColourPrimary: company?.brandColourPrimary ?? null,
      notificationsFromEmail: company?.notificationsFromEmail ?? null,
      proposalEmailEnabled: company?.proposalEmailEnabled ?? true,
    }
  );

  // Reload and return updated quote
  const [updated] = await db.select().from(quotesTable).where(eq(quotesTable.enquiryId, id));
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
  if (!["accepted", "deposit_awaiting_payment"].includes(existing.proposalStatus)) {
    res.status(400).json({ error: "The proposal must be accepted before recording a deposit" });
    return;
  }
  if (existing.depositPaidAt) {
    res.status(400).json({ error: "The deposit has already been recorded" });
    return;
  }

  const expectedDeposit = Math.round(Number(existing.depositAmount ?? 0) * 100) / 100;
  if (expectedDeposit <= 0) {
    res.status(400).json({ error: "This accepted proposal does not require a deposit" });
    return;
  }
  if (Math.abs(amount - expectedDeposit) > 0.005) {
    res.status(400).json({ error: `The deposit amount must match the agreed ${expectedDeposit.toFixed(2)} payment schedule` });
    return;
  }

  const total = Number(existing.totalWithVat);
  const remaining = Math.max(0, Math.round((total - expectedDeposit) * 100) / 100);

  const [updated] = await db
    .update(quotesTable)
    .set({
      proposalStatus: "accepted",
      depositPaidAt: new Date(),
      depositPaidAmount: expectedDeposit.toFixed(2),
      remainingBalance: remaining.toString(),
      status: "accepted",
    })
    .where(eq(quotesTable.enquiryId, id))
    .returning();

  res.json(parseQuote(updated));
});

export default router;
