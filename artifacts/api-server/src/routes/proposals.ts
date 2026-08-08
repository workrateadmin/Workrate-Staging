/**
 * Public proposal routes — no authentication required.
 * Customers access these via a unique proposal token.
 */
import { Router, type IRouter } from "express";
import { db, quotesTable, enquiriesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function parseQuoteNumerics(q: any) {
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

/** GET /proposals/:token — public proposal view */
router.get("/proposals/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.proposalToken, token));

  if (!quote) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  // Only expose proposals that have been approved/sent
  const visibleStatuses = ["sent", "viewed", "accepted", "deposit_awaiting_payment", "deposit_paid", "declined"];
  if (!visibleStatuses.includes(quote.proposalStatus)) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  // Load enquiry for customer name
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(eq(enquiriesTable.id, quote.enquiryId));

  // Load company branding (from snapshot if available, else live)
  let companyData: any = {};
  if (quote.brandingSnapshot) {
    try { companyData = JSON.parse(quote.brandingSnapshot); } catch {}
  } else {
    // Fall back to live company data (shouldn't happen post-approve, but safe)
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.ownerUserId, enquiry?.ownerUserId ?? ""))
      .limit(1);
    if (company) {
      companyData = {
        name: company.name,
        logoUrl: company.logoUrl,
        email: company.email,
        phone: company.phone,
        address: company.address,
        website: company.website,
        vatNumber: company.vatNumber,
        brandColourPrimary: company.brandColourPrimary,
        paymentTerms: company.paymentTerms,
        termsAndConditions: company.termsAndConditions,
        bankPaymentDetails: company.bankPaymentDetails,
        depositPaymentInstructions: company.depositPaymentInstructions,
      };
    }
  }

  const parsed = parseQuoteNumerics(quote);

  res.json({
    ...parsed,
    company: companyData,
    // Don't expose internal fields
    proposalToken: undefined,
    brandingSnapshot: undefined,
    ownerUserId: undefined,
    acceptanceSnapshot: undefined,
  });
});

/** POST /proposals/:token/view — record first view */
router.post("/proposals/:token/view", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.proposalToken, token));

  if (!quote) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  // Only record view if it's in 'sent' status (first view)
  if (quote.proposalStatus === "sent") {
    await db
      .update(quotesTable)
      .set({ proposalStatus: "viewed", viewedAt: new Date() })
      .where(eq(quotesTable.proposalToken, token));
  }

  res.json({ ok: true });
});

/** POST /proposals/:token/respond — customer accepts / declines / asks question */
router.post("/proposals/:token/respond", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { action, name, email, message } = req.body ?? {};

  if (!action || !["accept", "decline", "question"].includes(action)) {
    res.status(400).json({ error: "action must be 'accept', 'decline', or 'question'" });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.proposalToken, token));

  if (!quote) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  const respondableStatuses = ["sent", "viewed"];
  if (!respondableStatuses.includes(quote.proposalStatus)) {
    res.status(400).json({ error: "This proposal has already been responded to" });
    return;
  }

  const now = new Date();
  const updates: Record<string, any> = {};

  if (action === "accept") {
    updates.proposalStatus = "deposit_awaiting_payment";
    updates.acceptedAt = now;
    updates.acceptedByName = name ?? null;
    updates.acceptedByEmail = email ?? null;

    // Snapshot the agreed terms at the moment of acceptance
    updates.acceptanceSnapshot = JSON.stringify({
      acceptedAt: now.toISOString(),
      acceptedByName: name ?? null,
      acceptedByEmail: email ?? null,
      totalWithVat: Number(quote.totalWithVat),
      depositAmount: Number(quote.depositAmount ?? 0),
      remainingBalance: Number(quote.remainingBalance ?? 0),
      depositType: quote.depositType,
      depositPercent: quote.depositPercent ? Number(quote.depositPercent) : null,
      depositFixed: quote.depositFixed ? Number(quote.depositFixed) : null,
      projectDescription: quote.projectDescription,
      customerDetails: quote.customerDetails,
      notes: quote.notes,
    });

    // Also update enquiry status to won
    await db
      .update(enquiriesTable)
      .set({ status: "won" })
      .where(eq(enquiriesTable.id, quote.enquiryId));
  } else if (action === "decline") {
    updates.proposalStatus = "declined";
    updates.customerQuestion = message ?? null;
  } else if (action === "question") {
    updates.customerQuestion = message ?? null;
    // Stay in viewed status but store the question
  }

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(eq(quotesTable.proposalToken, token))
    .returning();

  res.json(parseQuoteNumerics(updated));
});

export default router;
