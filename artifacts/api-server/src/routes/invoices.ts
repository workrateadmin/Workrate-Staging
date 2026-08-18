import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, quotesTable, companiesTable } from "@workspace/db";
import { sendInvoiceEmail } from "../services/customer-comms";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function parseInvoice(q: any) {
  return {
    ...q,
    materialsAllowance: Number(q.materialsAllowance ?? 0),
    labourAllowance: Number(q.labourAllowance ?? 0),
    estimatedTotal: Number(q.estimatedTotal ?? 0),
    vatAmount: Number(q.vatAmount ?? 0),
    vatRate: Number(q.vatRate ?? 20),
    totalWithVat: Number(q.totalWithVat ?? 0),
    jobId: q.jobId ?? null,
    enquiryId: q.enquiryId ?? null,
    depositPaidAmount: q.depositPaidAmount != null ? Number(q.depositPaidAmount) : null,
  };
}

/** Snapshot current company branding for the invoice record. */
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

// ── List invoices ──────────────────────────────────────────────────────────────

router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  const invoices = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.documentType, "invoice"),
        eq(quotesTable.ownerUserId, userId!),
      ),
    )
    .orderBy(desc(quotesTable.createdAt));

  res.json(invoices.map(parseInvoice));
});

// ── Create standalone invoice ──────────────────────────────────────────────────

router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const body = req.body;

  const today = new Date().toISOString().split("T")[0];

  // Insert first to get the auto-generated ID
  const [inserted] = await db
    .insert(quotesTable)
    .values({
      documentType: "invoice",
      ownerUserId: userId!,
      enquiryId: null,
      customerDetails: body.customerDetails ?? null,
      emailRecipient: body.customerEmail ?? null,
      projectDescription: body.projectDescription ?? null,
      invoiceDate: body.invoiceDate ?? today,
      dueDate: body.dueDate ?? null,
      jobId: body.jobId ?? null,
      vatRate: String(body.vatRate ?? "20"),
      lineItems: body.lineItems ?? null,
      notes: body.notes ?? null,
      materialsAllowance: String(body.materialsAllowance ?? "0"),
      labourAllowance: "0",
      estimatedTotal: String(body.estimatedTotal ?? body.materialsAllowance ?? "0"),
      vatAmount: String(body.vatAmount ?? "0"),
      totalWithVat: String(body.totalWithVat ?? "0"),
      status: "draft",
      proposalStatus: "draft",
    } as any)
    .returning();

  // Set invoice number using the row ID so it's always unique
  const invoiceNumber =
    body.invoiceNumber ||
    `INV-${new Date().getFullYear()}-${String(inserted.id).padStart(4, "0")}`;

  const [final] = await db
    .update(quotesTable)
    .set({ invoiceNumber })
    .where(eq(quotesTable.id, inserted.id))
    .returning();

  res.status(201).json(parseInvoice(final));
});

// ── Get invoice ────────────────────────────────────────────────────────────────

router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const [invoice] = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.id, id),
        eq(quotesTable.documentType, "invoice"),
        eq(quotesTable.ownerUserId, userId!),
      ),
    );

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(parseInvoice(invoice));
});

// ── Update invoice ─────────────────────────────────────────────────────────────

router.patch("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const [existing] = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.id, id),
        eq(quotesTable.documentType, "invoice"),
        eq(quotesTable.ownerUserId, userId!),
      ),
    );
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const body = req.body;
  const updates: Record<string, any> = {};

  if (body.customerDetails !== undefined) updates.customerDetails = body.customerDetails;
  if (body.customerEmail !== undefined)   updates.emailRecipient = body.customerEmail;
  if (body.projectDescription !== undefined) updates.projectDescription = body.projectDescription;
  if (body.invoiceNumber !== undefined)   updates.invoiceNumber = body.invoiceNumber;
  if (body.invoiceDate !== undefined)     updates.invoiceDate = body.invoiceDate;
  if (body.dueDate !== undefined)         updates.dueDate = body.dueDate;
  if (body.jobId !== undefined)           updates.jobId = body.jobId;
  if (body.materialsAllowance !== undefined) updates.materialsAllowance = String(body.materialsAllowance);
  if (body.estimatedTotal !== undefined)  updates.estimatedTotal = String(body.estimatedTotal);
  if (body.vatAmount !== undefined)       updates.vatAmount = String(body.vatAmount);
  if (body.vatRate !== undefined)         updates.vatRate = String(body.vatRate);
  if (body.totalWithVat !== undefined)    updates.totalWithVat = String(body.totalWithVat);
  if (body.lineItems !== undefined)       updates.lineItems = body.lineItems;
  if (body.notes !== undefined)           updates.notes = body.notes;
  if (body.status !== undefined)          updates.status = body.status;

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(eq(quotesTable.id, id))
    .returning();

  res.json(parseInvoice(updated));
});

// ── Send invoice email ─────────────────────────────────────────────────────────

router.post("/invoices/:id/send", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const [invoice] = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.id, id),
        eq(quotesTable.documentType, "invoice"),
        eq(quotesTable.ownerUserId, userId!),
      ),
    );
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  // Snapshot branding at send time
  const brandingSnapshot = await snapshotBranding(userId!);

  // Mark as sent
  await db
    .update(quotesTable)
    .set({ status: "sent", brandingSnapshot })
    .where(eq(quotesTable.id, id));

  // Send email (fire-and-forget safe)
  Promise.resolve().then(async () => {
    try {
      await sendInvoiceEmail(
        id,
        {
          customerEmail: invoice.emailRecipient ?? null,
          customerName: invoice.customerDetails?.split("\n")[0]?.trim() ?? null,
          invoiceNumber: (invoice as any).invoiceNumber ?? `INV-${id}`,
          invoiceDate: (invoice as any).invoiceDate ?? null,
          dueDate: (invoice as any).dueDate ?? null,
          totalWithVat: Number(invoice.totalWithVat),
          projectDescription: invoice.projectDescription ?? null,
        },
        {
          name: company?.name ?? "Your tradesperson",
          email: company?.email ?? null,
          phone: company?.phone ?? null,
          website: (company as any)?.website ?? null,
          logoUrl: company?.logoUrl ?? null,
          brandColourPrimary: (company as any)?.brandColourPrimary ?? null,
          bankPaymentDetails: (company as any)?.bankPaymentDetails ?? null,
          paymentTerms: (company as any)?.paymentTerms ?? null,
        },
      );
    } catch (err) {
      console.error("[comms] invoice email failed:", err);
    }
  });

  const [updated] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, id));

  res.json(parseInvoice(updated));
});

// ── Mark invoice as paid ───────────────────────────────────────────────────────

router.post("/invoices/:id/mark-paid", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const amount = Number(req.body?.amount);
  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const [invoice] = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.id, id),
        eq(quotesTable.documentType, "invoice"),
        eq(quotesTable.ownerUserId, userId!),
      ),
    );
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [updated] = await db
    .update(quotesTable)
    .set({
      status: "paid",
      paidAt: new Date(),
      depositPaidAt: new Date(),
      depositPaidAmount: amount.toString(),
    } as any)
    .where(eq(quotesTable.id, id))
    .returning();

  res.json(parseInvoice(updated));
});

export default router;
