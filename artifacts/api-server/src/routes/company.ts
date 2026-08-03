import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, companiesTable } from "@workspace/db";
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

router.get("/company", requireAuth, async (_req, res): Promise<void> => {
  const [company] = await db.select().from(companiesTable).limit(1);
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

  const d = parsed.data;
  const [existing] = await db.select().from(companiesTable).limit(1);

  if (!existing) {
    const [created] = await db
      .insert(companiesTable)
      .values({
        ...(d.name !== undefined && { name: d.name }),
        ...(d.tradeType !== undefined && { tradeType: d.tradeType }),
        ...(d.serviceArea !== undefined && { serviceArea: d.serviceArea }),
        ...(d.labourRatePerHour !== undefined && { labourRatePerHour: d.labourRatePerHour.toString() }),
        ...(d.dayRate !== undefined && { dayRate: d.dayRate.toString() }),
        ...(d.materialMarkupPercent !== undefined && { materialMarkupPercent: d.materialMarkupPercent.toString() }),
        ...(d.minimumProjectValue !== undefined && { minimumProjectValue: d.minimumProjectValue.toString() }),
        ...(d.typicalLeadTimes !== undefined && { typicalLeadTimes: d.typicalLeadTimes }),
        ...(d.preferredSuppliers !== undefined && { preferredSuppliers: d.preferredSuppliers }),
        ...(d.logoUrl !== undefined && { logoUrl: d.logoUrl }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.address !== undefined && { address: d.address }),
      })
      .returning();
    res.json(UpdateCompanyResponse.parse(parseCompany(created)));
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set({
      ...(d.name !== undefined && { name: d.name }),
      ...(d.tradeType !== undefined && { tradeType: d.tradeType }),
      ...(d.serviceArea !== undefined && { serviceArea: d.serviceArea }),
      ...(d.labourRatePerHour !== undefined && { labourRatePerHour: d.labourRatePerHour.toString() }),
      ...(d.dayRate !== undefined && { dayRate: d.dayRate.toString() }),
      ...(d.materialMarkupPercent !== undefined && { materialMarkupPercent: d.materialMarkupPercent.toString() }),
      ...(d.minimumProjectValue !== undefined && { minimumProjectValue: d.minimumProjectValue.toString() }),
      ...(d.typicalLeadTimes !== undefined && { typicalLeadTimes: d.typicalLeadTimes }),
      ...(d.preferredSuppliers !== undefined && { preferredSuppliers: d.preferredSuppliers }),
      ...(d.logoUrl !== undefined && { logoUrl: d.logoUrl }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.phone !== undefined && { phone: d.phone }),
      ...(d.address !== undefined && { address: d.address }),
    })
    .where(eq(companiesTable.id, existing.id))
    .returning();

  res.json(UpdateCompanyResponse.parse(parseCompany(updated)));
});

import { eq } from "drizzle-orm";

export default router;
