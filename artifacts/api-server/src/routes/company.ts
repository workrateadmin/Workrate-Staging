import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";
import { db, companiesTable, enquiriesTable, aiReceptionistSettingsTable, integrationsTable } from "@workspace/db";
import { eq, isNull, and, ne, isNotNull, count } from "drizzle-orm";
import {
  GetCompanyResponse,
  UpdateCompanyBody,
  UpdateCompanyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function parseCompany(c: any) {
  return {
    ...c,
    labourRatePerHour: Number(c.labourRatePerHour ?? 0),
    dayRate: c.dayRate != null ? Number(c.dayRate) : null,
    materialMarkupPercent: Number(c.materialMarkupPercent ?? 0),
    minimumProjectValue: c.minimumProjectValue != null ? Number(c.minimumProjectValue) : null,
    defaultDepositPercent: c.defaultDepositPercent != null ? Number(c.defaultDepositPercent) : 50,
    defaultDepositFixed: c.defaultDepositFixed != null ? Number(c.defaultDepositFixed) : null,
    remainingBalanceDueDays: c.remainingBalanceDueDays != null ? Number(c.remainingBalanceDueDays) : 30,
  };
}

/**
 * Claim all unowned (legacy / NULL ownerUserId) records for the given userId.
 * Called once when the first authenticated user encounters data with no owner —
 * this transparently migrates existing single-user deployments.
 */
async function claimUnownedRecords(userId: string): Promise<void> {
  await Promise.all([
    db.update(companiesTable).set({ ownerUserId: userId }).where(isNull(companiesTable.ownerUserId)),
    db.update(enquiriesTable).set({ ownerUserId: userId }).where(isNull(enquiriesTable.ownerUserId)),
    db.update(aiReceptionistSettingsTable).set({ ownerUserId: userId }).where(isNull(aiReceptionistSettingsTable.ownerUserId)),
    db.update(integrationsTable).set({ ownerUserId: userId }).where(isNull(integrationsTable.ownerUserId)),
  ]);
}

/**
 * Claim enquiries owned by a *different* non-null userId — handles the
 * Clerk dev-vs-production user-ID split in single-tenant deployments.
 *
 * Clerk dev and production environments use separate user stores, so the same
 * person has a different userId in each environment. When the production user
 * logs in for the first time (their company was just auto-created), any
 * enquiries that were created via the widget using the dev-environment userId
 * as the businessId will have a foreign ownerUserId.  We auto-claim them here.
 *
 * Safety guard: we only do this when there is exactly ONE company in the
 * database (this user's freshly created one), which guarantees this is a
 * single-tenant deployment and no other tenant's data is at risk.
 */
async function claimOrphanedEnquiries(userId: string): Promise<void> {
  const [{ cnt }] = await db.select({ cnt: count() }).from(companiesTable);
  if (Number(cnt) !== 1) return; // multi-tenant guard — never touch other people's data

  await Promise.all([
    db.update(enquiriesTable)
      .set({ ownerUserId: userId })
      .where(and(isNotNull(enquiriesTable.ownerUserId), ne(enquiriesTable.ownerUserId, userId))),
    db.update(aiReceptionistSettingsTable)
      .set({ ownerUserId: userId })
      .where(and(isNotNull(aiReceptionistSettingsTable.ownerUserId), ne(aiReceptionistSettingsTable.ownerUserId, userId))),
    db.update(integrationsTable)
      .set({ ownerUserId: userId })
      .where(and(isNotNull(integrationsTable.ownerUserId), ne(integrationsTable.ownerUserId, userId))),
  ]);
}

router.get("/company", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  // 1. Try to find the user's own company
  let [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  // 2. If none owned, check for unowned legacy records and claim them
  if (!company) {
    const [unowned] = await db
      .select()
      .from(companiesTable)
      .where(isNull(companiesTable.ownerUserId))
      .limit(1);

    if (unowned) {
      const widgetToken = unowned.widgetToken ?? randomUUID();
      await Promise.all([
        claimUnownedRecords(userId!),
        // Generate a widgetToken if the existing company doesn't have one
        unowned.widgetToken
          ? Promise.resolve()
          : db.update(companiesTable).set({ widgetToken }).where(eq(companiesTable.id, unowned.id)),
      ]);
      // Claim enquiries owned by a different (e.g. dev-environment) userId —
      // same logic as the auto-create path; previously missing from this branch.
      await claimOrphanedEnquiries(userId!);
      company = { ...unowned, ownerUserId: userId!, widgetToken };
    }
  }

  // 3. If still no company, auto-create one (first login on this Clerk environment).
  //    This covers the case where the production user has never logged in before —
  //    they get a fresh company with a stable widgetToken, then we claim any
  //    enquiries that exist under a different (e.g., dev-environment) userId.
  if (!company) {
    [company] = await db
      .insert(companiesTable)
      .values({ ownerUserId: userId!, widgetToken: randomUUID() })
      .returning();
    await claimOrphanedEnquiries(userId!);
  }

  res.json(GetCompanyResponse.parse(parseCompany(company)));
});

router.put("/company", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = getAuth(req);
  const d = parsed.data;

  // Find or claim the user's company
  let [existing] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  if (!existing) {
    const [unowned] = await db
      .select()
      .from(companiesTable)
      .where(isNull(companiesTable.ownerUserId))
      .limit(1);

    if (unowned) {
      await claimUnownedRecords(userId!);
      existing = { ...unowned, ownerUserId: userId! };
    }
  }

  const values = {
    ownerUserId: userId!,
    ...(d.name !== undefined && { name: d.name }),
    ...(d.tradeType !== undefined && { tradeType: d.tradeType }),
    ...(d.serviceArea !== undefined && { serviceArea: d.serviceArea }),
    ...(d.labourRatePerHour !== undefined && { labourRatePerHour: d.labourRatePerHour.toString() }),
    ...(d.dayRate !== undefined && { dayRate: d.dayRate !== null ? d.dayRate.toString() : null }),
    ...(d.materialMarkupPercent !== undefined && { materialMarkupPercent: d.materialMarkupPercent.toString() }),
    ...(d.minimumProjectValue !== undefined && { minimumProjectValue: d.minimumProjectValue !== null ? d.minimumProjectValue.toString() : null }),
    ...(d.typicalLeadTimes !== undefined && { typicalLeadTimes: d.typicalLeadTimes }),
    ...(d.preferredSuppliers !== undefined && { preferredSuppliers: d.preferredSuppliers }),
    ...(d.logoUrl !== undefined && { logoUrl: d.logoUrl }),
    ...(d.email !== undefined && { email: d.email }),
    ...(d.phone !== undefined && { phone: d.phone }),
    ...(d.address !== undefined && { address: d.address }),
    ...(d.website !== undefined && { website: d.website }),
    ...(d.companyRegNumber !== undefined && { companyRegNumber: d.companyRegNumber }),
    ...(d.vatNumber !== undefined && { vatNumber: d.vatNumber }),
    ...(d.bankPaymentDetails !== undefined && { bankPaymentDetails: d.bankPaymentDetails }),
    ...(d.brandColourPrimary !== undefined && { brandColourPrimary: d.brandColourPrimary }),
    ...(d.brandColourSecondary !== undefined && { brandColourSecondary: d.brandColourSecondary }),
    ...(d.paymentTerms !== undefined && { paymentTerms: d.paymentTerms }),
    ...(d.termsAndConditions !== undefined && { termsAndConditions: d.termsAndConditions }),
    ...(d.quoteFooter !== undefined && { quoteFooter: d.quoteFooter }),
    ...(d.invoiceFooter !== undefined && { invoiceFooter: d.invoiceFooter }),
    ...(d.documentMode !== undefined && { documentMode: d.documentMode }),
    ...(d.defaultDepositType !== undefined && { defaultDepositType: d.defaultDepositType }),
    ...(d.defaultDepositPercent !== undefined && { defaultDepositPercent: d.defaultDepositPercent.toString() }),
    ...(d.defaultDepositFixed !== undefined && { defaultDepositFixed: d.defaultDepositFixed !== null ? d.defaultDepositFixed.toString() : null }),
    ...(d.depositPaymentInstructions !== undefined && { depositPaymentInstructions: d.depositPaymentInstructions }),
    ...(d.remainingBalanceDueDays !== undefined && { remainingBalanceDueDays: d.remainingBalanceDueDays }),
    ...(d.notificationsFromEmail !== undefined && { notificationsFromEmail: d.notificationsFromEmail }),
    ...(d.enquiryConfirmationEnabled !== undefined && { enquiryConfirmationEnabled: d.enquiryConfirmationEnabled }),
    ...(d.enquiryEmailEnabled !== undefined && { enquiryEmailEnabled: d.enquiryEmailEnabled }),
    ...(d.enquirySmsEnabled !== undefined && { enquirySmsEnabled: d.enquirySmsEnabled }),
    ...(d.enquiryConfirmationMessage !== undefined && { enquiryConfirmationMessage: d.enquiryConfirmationMessage }),
    ...(d.proposalEmailEnabled !== undefined && { proposalEmailEnabled: d.proposalEmailEnabled }),
  };

  if (!existing) {
    const [created] = await db
      .insert(companiesTable)
      .values({ ...values, widgetToken: randomUUID() })
      .returning();
    res.json(UpdateCompanyResponse.parse(parseCompany(created)));
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set(values)
    .where(eq(companiesTable.id, existing.id))
    .returning();

  res.json(UpdateCompanyResponse.parse(parseCompany(updated)));
});

export default router;
