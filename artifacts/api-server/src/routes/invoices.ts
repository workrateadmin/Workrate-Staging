import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, quotesTable, companiesTable, jobsTable, enquiriesTable } from "@workspace/db";
import { sendInvoiceEmail } from "../services/customer-comms";
import { renderInvoicePdf } from "../services/invoice-pdf";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

/** The only permitted invoice job link is one whose enquiry belongs to this Clerk user. */
export async function findInvoiceLinkableJob(jobId: number, userId: string) {
  const [row] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .innerJoin(enquiriesTable, eq(jobsTable.enquiryId, enquiriesTable.id))
    .where(and(eq(jobsTable.id, jobId), eq(enquiriesTable.ownerUserId, userId)))
    .limit(1);
  return row ?? null;
}

async function validateInvoiceJobLink(value: unknown, userId: string): Promise<{ jobId?: number; error?: string }> {
  if (value == null) return {};
  const jobId = Number(value);
  if (!Number.isInteger(jobId) || jobId <= 0) return { error: "jobId must be a positive integer or null" };
  if (!await findInvoiceLinkableJob(jobId, userId)) return { error: "Job not found" };
  return { jobId };
}

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
    depositPercent: q.depositPercent != null ? Number(q.depositPercent) : null,
    depositAmount: q.depositAmount != null ? Number(q.depositAmount) : null,
    remainingBalance: q.remainingBalance != null ? Number(q.remainingBalance) : null,
    depositPaidAmount: q.depositPaidAmount != null ? Number(q.depositPaidAmount) : null,
  };
}

function pdfFilenamePart(value: unknown, fallback: string): string {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 80);
  return normalized || fallback;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateInvoiceDeposit(
  totalValue: unknown,
  depositTypeValue: unknown,
  depositPercentValue: unknown,
): { values?: Record<string, string | null>; error?: string } {
  const total = Number(totalValue);
  if (!Number.isFinite(total) || total < 0) {
    return { error: "Invoice total must be a valid non-negative number" };
  }

  const roundedTotal = roundMoney(total);
  const depositType = depositTypeValue ?? "none";
  if (depositType === "none") {
    return {
      values: {
        depositType: "none",
        depositPercent: null,
        depositFixed: null,
        depositAmount: "0",
        remainingBalance: roundedTotal.toFixed(2),
      },
    };
  }

  if (depositType !== "percentage") {
    return { error: "Deposit type must be 'none' or 'percentage'" };
  }

  const depositPercent = Number(depositPercentValue);
  if (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent > 100) {
    return { error: "Deposit percentage must be greater than 0 and no more than 100" };
  }

  const roundedPercent = roundMoney(depositPercent);
  const depositAmount = roundMoney(roundedTotal * (roundedPercent / 100));
  return {
    values: {
      depositType: "percentage",
      depositPercent: roundedPercent.toFixed(2),
      depositFixed: null,
      depositAmount: depositAmount.toFixed(2),
      remainingBalance: roundMoney(roundedTotal - depositAmount).toFixed(2),
    },
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
    depositPaymentInstructions: (company as any).depositPaymentInstructions,
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
  const jobLink = await validateInvoiceJobLink(body.jobId, userId!);
  if (jobLink.error) { res.status(jobLink.error === "Job not found" ? 404 : 400).json({ error: jobLink.error }); return; }

  const today = new Date().toISOString().split("T")[0];
  const deposit = calculateInvoiceDeposit(
    body.totalWithVat ?? "0",
    body.depositType,
    body.depositPercent,
  );
  if (deposit.error) {
    res.status(400).json({ error: deposit.error });
    return;
  }

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
       jobId: jobLink.jobId ?? null,
      vatRate: String(body.vatRate ?? "20"),
      lineItems: body.lineItems ?? null,
      notes: body.notes ?? null,
      materialsAllowance: String(body.materialsAllowance ?? "0"),
      labourAllowance: "0",
      estimatedTotal: String(body.estimatedTotal ?? body.materialsAllowance ?? "0"),
      vatAmount: String(body.vatAmount ?? "0"),
      totalWithVat: String(body.totalWithVat ?? "0"),
      ...deposit.values,
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

// ── Download invoice PDF ───────────────────────────────────────────────────────

router.get("/invoices/:id/pdf", requireAuth, async (req, res): Promise<void> => {
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

  try {
    const pdf = await renderInvoicePdf({
      ...parseInvoice(invoice),
      company: company ?? null,
    });
    const invoiceNumber = pdfFilenamePart(invoice.invoiceNumber, `INV-${id}`);
    const customerName = pdfFilenamePart(invoice.customerDetails?.split("\n")[0], "Customer");
    const filename = `Invoice-${invoiceNumber}-${customerName}.pdf`;

    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (error) {
    req.log.error({ err: error, invoiceId: id }, "Failed to generate invoice PDF");
    res.status(500).json({ error: "Failed to generate invoice PDF" });
  }
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
  if (body.jobId !== undefined) {
    const jobLink = await validateInvoiceJobLink(body.jobId, userId!);
    if (jobLink.error) { res.status(jobLink.error === "Job not found" ? 404 : 400).json({ error: jobLink.error }); return; }
    updates.jobId = jobLink.jobId ?? null;
  }
  const financialDetailsLocked =
    Boolean(existing.depositPaidAt) ||
    Boolean(existing.paidAt) ||
    existing.status === "paid";

  const depositsAreChanging =
    body.depositType !== undefined ||
    body.depositPercent !== undefined ||
    body.totalWithVat !== undefined;
  if (financialDetailsLocked && depositsAreChanging) {
    const totalChanged =
      body.totalWithVat !== undefined &&
      roundMoney(Number(body.totalWithVat)) !== roundMoney(Number(existing.totalWithVat));
    const depositTypeChanged =
      body.depositType !== undefined &&
      body.depositType !== (existing.depositType ?? "none");
    const depositPercentChanged =
      body.depositPercent !== undefined &&
      roundMoney(Number(body.depositPercent)) !== roundMoney(Number(existing.depositPercent ?? 0));

    if (totalChanged || depositTypeChanged || depositPercentChanged) {
      res.status(400).json({ error: "Deposit details cannot be changed after the deposit has been recorded" });
      return;
    }
  }
  if (financialDetailsLocked) {
    const moneyFieldChanged = (field: string, savedValue: unknown) =>
      body[field] !== undefined &&
      roundMoney(Number(body[field])) !== roundMoney(Number(savedValue));
    const vatRateChanged =
      body.vatRate !== undefined &&
      roundMoney(Number(body.vatRate)) !== roundMoney(Number(existing.vatRate));
    const lineItemsChanged =
      body.lineItems !== undefined && body.lineItems !== existing.lineItems;

    if (
      moneyFieldChanged("materialsAllowance", existing.materialsAllowance) ||
      moneyFieldChanged("estimatedTotal", existing.estimatedTotal) ||
      moneyFieldChanged("vatAmount", existing.vatAmount) ||
      vatRateChanged ||
      lineItemsChanged
    ) {
      res.status(400).json({ error: "Financial details cannot be changed after payment has been recorded" });
      return;
    }
  }
  if (body.status !== undefined && body.status !== existing.status) {
    res.status(400).json({ error: "Invoice payment status must be updated through the dedicated payment actions" });
    return;
  }

  if (body.customerDetails !== undefined) updates.customerDetails = body.customerDetails;
  if (body.customerEmail !== undefined)   updates.emailRecipient = body.customerEmail;
  if (body.projectDescription !== undefined) updates.projectDescription = body.projectDescription;
  if (body.invoiceNumber !== undefined)   updates.invoiceNumber = body.invoiceNumber;
  if (body.invoiceDate !== undefined)     updates.invoiceDate = body.invoiceDate;
  if (body.dueDate !== undefined)         updates.dueDate = body.dueDate;
  // jobId is validated above through jobs -> enquiries ownership.
  if (body.materialsAllowance !== undefined) updates.materialsAllowance = String(body.materialsAllowance);
  if (body.estimatedTotal !== undefined)  updates.estimatedTotal = String(body.estimatedTotal);
  if (body.vatAmount !== undefined)       updates.vatAmount = String(body.vatAmount);
  if (body.vatRate !== undefined)         updates.vatRate = String(body.vatRate);
  if (body.totalWithVat !== undefined)    updates.totalWithVat = String(body.totalWithVat);
  if (body.lineItems !== undefined)       updates.lineItems = body.lineItems;
  if (body.notes !== undefined)           updates.notes = body.notes;

  if (depositsAreChanging && !financialDetailsLocked) {
    const deposit = calculateInvoiceDeposit(
      body.totalWithVat ?? existing.totalWithVat,
      body.depositType ?? existing.depositType,
      body.depositPercent ?? existing.depositPercent,
    );
    if (deposit.error) {
      res.status(400).json({ error: deposit.error });
      return;
    }
    Object.assign(updates, deposit.values);
  }

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

  // Persist the branding that the attachment will use. The sent status is only
  // applied after Resend accepts the email.
  await db
    .update(quotesTable)
    .set({
      brandingSnapshot,
    })
    .where(eq(quotesTable.id, id));

  const delivery = await sendInvoiceEmail(
    id,
    {
      customerEmail: invoice.emailRecipient ?? null,
      customerName: invoice.customerDetails?.split("\n")[0]?.trim() ?? null,
      invoiceNumber: (invoice as any).invoiceNumber ?? `INV-${id}`,
      invoiceDate: (invoice as any).invoiceDate ?? null,
      dueDate: (invoice as any).dueDate ?? null,
      totalWithVat: Number(invoice.totalWithVat),
      depositAmount: invoice.depositAmount != null ? Number(invoice.depositAmount) : null,
      remainingBalance: invoice.remainingBalance != null ? Number(invoice.remainingBalance) : null,
      depositPaidAmount: invoice.depositPaidAmount != null ? Number(invoice.depositPaidAmount) : null,
      projectDescription: invoice.projectDescription ?? null,
    },
    {
      name: company?.name ?? "Your tradesperson",
      address: company?.address ?? null,
      email: company?.email ?? null,
      phone: company?.phone ?? null,
      website: (company as any)?.website ?? null,
      logoUrl: company?.logoUrl ?? null,
      companyRegNumber: (company as any)?.companyRegNumber ?? null,
      vatNumber: (company as any)?.vatNumber ?? null,
      brandColourPrimary: (company as any)?.brandColourPrimary ?? null,
      brandColourSecondary: (company as any)?.brandColourSecondary ?? null,
      bankPaymentDetails: (company as any)?.bankPaymentDetails ?? null,
      paymentTerms: (company as any)?.paymentTerms ?? null,
      depositPaymentInstructions: (company as any)?.depositPaymentInstructions ?? null,
      termsAndConditions: (company as any)?.termsAndConditions ?? null,
      invoiceFooter: (company as any)?.invoiceFooter ?? null,
    },
  );

  if (delivery.emailStatus === "sent" && invoice.status === "draft") {
    await db
      .update(quotesTable)
      .set({ status: "sent" })
      .where(and(eq(quotesTable.id, id), eq(quotesTable.status, "draft")));
  }

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

  const expectedAmount = Number(
    invoice.depositPaidAt
      ? (invoice.remainingBalance ?? invoice.totalWithVat)
      : invoice.totalWithVat,
  );
  if (!Number.isFinite(expectedAmount) || Math.abs(amount - expectedAmount) > 0.01) {
    res.status(400).json({
      error: `The final payment amount must be ${roundMoney(expectedAmount).toFixed(2)}`,
    });
    return;
  }

  const [updated] = await db
    .update(quotesTable)
    .set({
      status: "paid",
      paidAt: new Date(),
      remainingBalance: "0",
    } as any)
    .where(eq(quotesTable.id, id))
    .returning();

  res.json(parseInvoice(updated));
});

// ── Mark invoice deposit as received ───────────────────────────────────────────

router.post("/invoices/:id/mark-deposit-paid", requireAuth, async (req, res): Promise<void> => {
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

  const depositAmount = Number(invoice.depositAmount ?? 0);
  if (invoice.status === "paid") {
    res.status(400).json({ error: "A deposit cannot be recorded for an invoice that is already paid" });
    return;
  }
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    res.status(400).json({ error: "This invoice does not have a deposit to record" });
    return;
  }
  if (invoice.depositPaidAt) {
    res.status(400).json({ error: "The deposit has already been recorded" });
    return;
  }

  const remainingBalance = Number(invoice.remainingBalance ?? 0);
  const fullyPaidByDeposit = Number.isFinite(remainingBalance) && remainingBalance <= 0.005;
  const receivedAt = new Date();

  const [updated] = await db
    .update(quotesTable)
    .set({
      depositPaidAt: receivedAt,
      depositPaidAmount: roundMoney(depositAmount).toFixed(2),
      ...(fullyPaidByDeposit
        ? {
            status: "paid",
            paidAt: receivedAt,
            remainingBalance: "0",
          }
        : {}),
    } as any)
    .where(eq(quotesTable.id, id))
    .returning();

  res.json(parseInvoice(updated));
});

export default router;
