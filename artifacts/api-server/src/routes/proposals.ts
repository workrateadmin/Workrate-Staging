/**
 * Public proposal routes — no authentication required.
 * Customers access these via a unique proposal token.
 */
import { Router, type IRouter } from "express";
import { db, quotesTable, enquiriesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Proposal links are intentionally public. Keep their response allow-listed so
 * internal estimating data can never leak through a newly-added quote column.
 */
function toPublicProposal(quote: any, company?: any) {
  const paymentStepAvailable = ["accepted", "deposit_awaiting_payment", "deposit_paid"]
    .includes(quote.proposalStatus);

  const publicCompany = company
    ? {
        name: company.name,
        logoUrl: company.logoUrl ?? null,
        email: company.email ?? null,
        phone: company.phone ?? null,
        address: company.address ?? null,
        website: company.website ?? null,
        vatNumber: company.vatNumber ?? null,
        brandColourPrimary: company.brandColourPrimary ?? null,
        paymentTerms: company.paymentTerms ?? null,
        termsAndConditions: company.termsAndConditions ?? null,
        ...(paymentStepAvailable
          ? {
              bankPaymentDetails: company.bankPaymentDetails ?? null,
              depositPaymentInstructions: company.depositPaymentInstructions ?? null,
            }
          : {}),
      }
    : undefined;

  return {
    id: quote.id,
    enquiryId: quote.enquiryId,
    customerDetails: quote.customerDetails ?? null,
    projectDescription: quote.projectDescription ?? null,
    totalWithVat: Number(quote.totalWithVat ?? 0),
    notes: quote.notes ?? null,
    assumptions: quote.assumptions ?? null,
    proposalStatus: quote.proposalStatus,
    depositType: quote.depositType ?? null,
    depositPercent: quote.depositPercent != null ? Number(quote.depositPercent) : null,
    depositFixed: quote.depositFixed != null ? Number(quote.depositFixed) : null,
    depositAmount: quote.depositAmount != null ? Number(quote.depositAmount) : null,
    remainingBalance: quote.remainingBalance != null ? Number(quote.remainingBalance) : null,
    depositPaidAt: quote.depositPaidAt ?? null,
    depositPaidAmount: quote.depositPaidAmount != null ? Number(quote.depositPaidAmount) : null,
    acceptedAt: quote.acceptedAt ?? null,
    viewedAt: quote.viewedAt ?? null,
    createdAt: quote.createdAt,
    ...(publicCompany ? { company: publicCompany } : {}),
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
  if (quote.enquiryId == null) {
    req.log.warn({ quoteId: quote.id }, "Public proposal is missing an enquiry");
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

  res.json(toPublicProposal(quote, companyData));
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
    if (quote.enquiryId == null) {
      req.log.warn({ quoteId: quote.id }, "Proposal acceptance attempted without an enquiry");
      res.status(400).json({ error: "This proposal cannot be accepted" });
      return;
    }

    updates.proposalStatus = "accepted";
    updates.status = "accepted";
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

  // Do not return the full updated database row: this endpoint is public too.
  res.json(toPublicProposal(updated));
});

export default router;
