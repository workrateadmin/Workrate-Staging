import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, companiesTable, enquiriesTable, aiReceptionistSettingsTable, integrationsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
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
  };
}

/**
 * Claim all unowned (legacy) records for the given userId.
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
      await claimUnownedRecords(userId!);
      company = { ...unowned, ownerUserId: userId! };
    }
  }

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
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
  };

  if (!existing) {
    const [created] = await db.insert(companiesTable).values(values).returning();
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
