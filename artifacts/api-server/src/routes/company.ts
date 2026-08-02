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

router.get("/company", requireAuth, async (_req, res): Promise<void> => {
  const [company] = await db.select().from(companiesTable).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(
    GetCompanyResponse.parse({
      ...company,
      labourRatePerHour: Number(company.labourRatePerHour),
      materialMarkupPercent: Number(company.materialMarkupPercent),
    }),
  );
});

router.put("/company", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(companiesTable).limit(1);

  if (!existing) {
    const [created] = await db
      .insert(companiesTable)
      .values({
        ...parsed.data,
        labourRatePerHour: parsed.data.labourRatePerHour?.toString(),
        materialMarkupPercent: parsed.data.materialMarkupPercent?.toString(),
      })
      .returning();
    res.json(
      UpdateCompanyResponse.parse({
        ...created,
        labourRatePerHour: Number(created.labourRatePerHour),
        materialMarkupPercent: Number(created.materialMarkupPercent),
      }),
    );
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.tradeType !== undefined && { tradeType: parsed.data.tradeType }),
      ...(parsed.data.serviceArea !== undefined && { serviceArea: parsed.data.serviceArea }),
      ...(parsed.data.labourRatePerHour !== undefined && { labourRatePerHour: parsed.data.labourRatePerHour.toString() }),
      ...(parsed.data.materialMarkupPercent !== undefined && { materialMarkupPercent: parsed.data.materialMarkupPercent.toString() }),
      ...(parsed.data.preferredSuppliers !== undefined && { preferredSuppliers: parsed.data.preferredSuppliers }),
      ...(parsed.data.logoUrl !== undefined && { logoUrl: parsed.data.logoUrl }),
      ...(parsed.data.email !== undefined && { email: parsed.data.email }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.address !== undefined && { address: parsed.data.address }),
    })
    .returning();

  res.json(
    UpdateCompanyResponse.parse({
      ...updated,
      labourRatePerHour: Number(updated.labourRatePerHour),
      materialMarkupPercent: Number(updated.materialMarkupPercent),
    }),
  );
});

export default router;
