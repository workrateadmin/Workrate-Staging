import { createHash } from "crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { and, desc, eq } from "drizzle-orm";
import {
  companiesTable,
  db,
  enquiriesTable,
  financeAuditEventsTable,
  financeExpensesTable,
  financeIncomeRecordsTable,
  financeReceiptsTable,
  jobsTable,
  quotesTable,
} from "@workspace/db";
import { downloadBufferFromStorage, uploadBufferToStorage } from "../lib/storageUpload";
import { extractReceiptSuggestion } from "../lib/receiptExtractor";

const router: IRouter = Router();

const EXPENSE_CATEGORIES = [
  "Materials",
  "Labour",
  "Fuel and travel",
  "Tools and equipment",
  "Plant hire",
  "Subcontractors",
  "Office and software",
  "Insurance",
  "Training",
  "Marketing",
  "Professional fees",
  "Other",
];

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
      "application/pdf",
    ]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error("Upload a JPG, PNG, WEBP, HEIC, or PDF receipt."));
  },
});

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

function moneyString(value: unknown): string | null {
  const amount = numberOrNull(value);
  return amount == null ? null : amount.toFixed(2);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return isDate(value) ? value : null;
  return value.toISOString().slice(0, 10);
}

function inPeriod(value: Date | string | null | undefined, from?: string, to?: string): boolean {
  const day = dateKey(value);
  if (!day) return false;
  return (!from || day >= from) && (!to || day <= to);
}

function parseExpense(expense: any) {
  return {
    ...expense,
    grossAmount: numberOrNull(expense.grossAmount),
    netAmount: numberOrNull(expense.netAmount),
    vatAmount: numberOrNull(expense.vatAmount),
  };
}

function parseIncome(income: any) {
  return {
    ...income,
    grossAmount: numberOrNull(income.grossAmount),
    netAmount: numberOrNull(income.netAmount),
    vatAmount: numberOrNull(income.vatAmount),
  };
}

async function businessFor(userId: string) {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .limit(1);
  return company ?? null;
}

async function jobBelongsToUser(jobId: number, userId: string): Promise<boolean> {
  const [job] = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .innerJoin(enquiriesTable, eq(jobsTable.enquiryId, enquiriesTable.id))
    .where(and(eq(jobsTable.id, jobId), eq(enquiriesTable.ownerUserId, userId)))
    .limit(1);
  return Boolean(job);
}

async function writeAudit(input: {
  companyId: number;
  ownerUserId: string;
  entityType: string;
  entityId: number;
  action: string;
  actorUserId: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  await db.insert(financeAuditEventsTable).values({
    ...input,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
  });
}

function periodQuery(req: any): { from?: string; to?: string } {
  const from = typeof req.query.from === "string" && isDate(req.query.from) ? req.query.from : undefined;
  const to = typeof req.query.to === "string" && isDate(req.query.to) ? req.query.to : undefined;
  return { from, to };
}

async function buildIncomeActivity(userId: string, companyId: number, from?: string, to?: string) {
  const [invoices, manualIncome] = await Promise.all([
    db.select()
      .from(quotesTable)
      .where(and(eq(quotesTable.ownerUserId, userId), eq(quotesTable.documentType, "invoice")))
      .orderBy(desc(quotesTable.createdAt)),
    db.select()
      .from(financeIncomeRecordsTable)
      .where(and(
        eq(financeIncomeRecordsTable.companyId, companyId),
        eq(financeIncomeRecordsTable.ownerUserId, userId),
      ))
      .orderBy(desc(financeIncomeRecordsTable.receivedDate)),
  ]);

  const activities: any[] = [];
  for (const invoice of invoices) {
    if (invoice.status !== "draft" && inPeriod(invoice.invoiceDate ?? invoice.createdAt, from, to)) {
      activities.push({
        id: `invoice-${invoice.id}`,
        type: "invoice",
        date: dateKey(invoice.invoiceDate ?? invoice.createdAt),
        description: invoice.invoiceNumber ?? `Invoice ${invoice.id}`,
        grossAmount: numberOrNull(invoice.totalWithVat) ?? 0,
        sourceInvoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    }
    if (invoice.depositPaidAt && inPeriod(invoice.depositPaidAt, from, to)) {
      activities.push({
        id: `deposit-${invoice.id}`,
        type: "deposit_received",
        date: dateKey(invoice.depositPaidAt),
        description: `Deposit received — ${invoice.invoiceNumber ?? `Invoice ${invoice.id}`}`,
        grossAmount: numberOrNull(invoice.depositPaidAmount ?? invoice.depositAmount) ?? 0,
        sourceInvoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    }
    if (invoice.paidAt && inPeriod(invoice.paidAt, from, to)) {
      const total = numberOrNull(invoice.totalWithVat) ?? 0;
      const deposit = numberOrNull(invoice.depositPaidAmount) ?? 0;
      activities.push({
        id: `final-${invoice.id}`,
        type: "final_payment_received",
        date: dateKey(invoice.paidAt),
        description: `Final payment received — ${invoice.invoiceNumber ?? `Invoice ${invoice.id}`}`,
        grossAmount: Math.max(0, Math.round((total - deposit) * 100) / 100),
        sourceInvoiceId: invoice.id,
        jobId: invoice.jobId,
      });
    }
  }

  for (const income of manualIncome) {
    if (inPeriod(income.receivedDate, from, to)) {
      activities.push({
        ...parseIncome(income),
        id: `other-${income.id}`,
        type: "other_income",
        date: income.receivedDate,
      });
    }
  }
  return activities.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function ownedExpense(id: number, companyId: number, userId: string) {
  const [expense] = await db
    .select()
    .from(financeExpensesTable)
    .where(and(
      eq(financeExpensesTable.id, id),
      eq(financeExpensesTable.companyId, companyId),
      eq(financeExpensesTable.ownerUserId, userId),
    ))
    .limit(1);
  return expense ?? null;
}

// ── Finance reference data and summaries ───────────────────────────────────────

router.get("/finance/categories", requireAuth, (_req, res): void => {
  res.json({ categories: EXPENSE_CATEGORIES });
});

router.get("/finance/summary", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const { from, to } = periodQuery(req);

  const [income, expenses, receipts] = await Promise.all([
    buildIncomeActivity(userId!, company.id, from, to),
    db.select().from(financeExpensesTable).where(and(
      eq(financeExpensesTable.companyId, company.id),
      eq(financeExpensesTable.ownerUserId, userId!),
    )),
    db.select().from(financeReceiptsTable).where(and(
      eq(financeReceiptsTable.companyId, company.id),
      eq(financeReceiptsTable.ownerUserId, userId!),
    )),
  ]);

  const periodExpenses = expenses.filter((expense) => inPeriod(expense.transactionDate, from, to));
  const reviewedExpenses = periodExpenses.filter((expense) =>
    expense.reviewStatus === "confirmed" || expense.reviewStatus === "corrected",
  );
  const sum = (rows: any[], key: string) =>
    Math.round(rows.reduce((total, row) => total + (numberOrNull(row[key]) ?? 0), 0) * 100) / 100;
  const invoiceIncome = sum(income.filter((item) => item.type === "invoice"), "grossAmount");
  const depositsReceived = sum(income.filter((item) => item.type === "deposit_received"), "grossAmount");
  const finalPayments = sum(income.filter((item) => item.type === "final_payment_received"), "grossAmount");
  const otherIncome = sum(income.filter((item) => item.type === "other_income"), "grossAmount");
  const receiptExpenseIds = new Set(receipts.map((receipt) => receipt.expenseId));
  const categoryBreakdown = Array.from(
    reviewedExpenses.reduce((groups, expense) => {
      const name = expense.category?.trim() || "Uncategorised";
      const current = groups.get(name) ?? { category: name, count: 0, grossAmount: 0, netAmount: 0, vatAmount: 0 };
      current.count += 1;
      current.grossAmount += numberOrNull(expense.grossAmount) ?? 0;
      current.netAmount += numberOrNull(expense.netAmount) ?? 0;
      current.vatAmount += numberOrNull(expense.vatAmount) ?? 0;
      groups.set(name, current);
      return groups;
    }, new Map<string, { category: string; count: number; grossAmount: number; netAmount: number; vatAmount: number }>())
      .values(),
  ).map((entry) => ({
    ...entry,
    grossAmount: Math.round(entry.grossAmount * 100) / 100,
    netAmount: Math.round(entry.netAmount * 100) / 100,
    vatAmount: Math.round(entry.vatAmount * 100) / 100,
  })).sort((left, right) => right.grossAmount - left.grossAmount);
  const expensesWithReceipt = reviewedExpenses.filter((expense) => receiptExpenseIds.has(expense.id));

  res.json({
    period: { from: from ?? null, to: to ?? null },
    income: {
      invoiceIncome,
      otherIncome,
      totalIncome: Math.round((invoiceIncome + otherIncome) * 100) / 100,
      depositsReceived,
      finalPayments,
      cashReceived: Math.round((depositsReceived + finalPayments + otherIncome) * 100) / 100,
    },
    expenses: {
      confirmedGross: sum(reviewedExpenses, "grossAmount"),
      confirmedNet: sum(reviewedExpenses, "netAmount"),
      confirmedVat: sum(reviewedExpenses, "vatAmount"),
      confirmedCount: reviewedExpenses.length,
      needsReviewCount: periodExpenses.filter((expense) =>
        expense.reviewStatus !== "confirmed" && expense.reviewStatus !== "corrected",
      ).length,
      categoryBreakdown,
      receiptAttachedCount: expensesWithReceipt.length,
      receiptAttachedGross: sum(expensesWithReceipt, "grossAmount"),
      missingReceiptCount: reviewedExpenses.length - expensesWithReceipt.length,
    },
    warnings: {
      unreviewed: periodExpenses
        .filter((expense) => expense.reviewStatus !== "confirmed" && expense.reviewStatus !== "corrected")
        .map((expense) => expense.id),
      missingReceipts: reviewedExpenses.filter((expense) => !receiptExpenseIds.has(expense.id)).map((expense) => expense.id),
      uncategorized: reviewedExpenses.filter((expense) => !expense.category || expense.category === "Other").map((expense) => expense.id),
      incompleteAmounts: reviewedExpenses
        .filter((expense) => expense.grossAmount == null || expense.transactionDate == null)
        .map((expense) => expense.id),
    },
    notice: "MTD preparation only. This summary does not submit anything to HMRC.",
  });
});

// ── Expenses and review ────────────────────────────────────────────────────────

router.get("/finance/expenses", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const expenses = await db
    .select()
    .from(financeExpensesTable)
    .where(and(
      eq(financeExpensesTable.companyId, company.id),
      eq(financeExpensesTable.ownerUserId, userId!),
    ))
    .orderBy(desc(financeExpensesTable.transactionDate), desc(financeExpensesTable.createdAt));
  res.json(expenses.map(parseExpense));
});

// A filtered record-level view for Tax / MTD preparation. Summary cards never
// hide the evidence behind an aggregate: users can inspect the exact records
// and attached documents which contribute to a period.
router.get("/finance/transactions", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const { from, to } = periodQuery(req);
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const reviewStatus = typeof req.query.reviewStatus === "string" ? req.query.reviewStatus : undefined;
  const hasReceipt = req.query.hasReceipt === "true" ? true : req.query.hasReceipt === "false" ? false : undefined;
  const [expenses, receipts] = await Promise.all([
    db.select().from(financeExpensesTable).where(and(
      eq(financeExpensesTable.companyId, company.id),
      eq(financeExpensesTable.ownerUserId, userId!),
    )).orderBy(desc(financeExpensesTable.transactionDate), desc(financeExpensesTable.createdAt)),
    db.select().from(financeReceiptsTable).where(and(
      eq(financeReceiptsTable.companyId, company.id),
      eq(financeReceiptsTable.ownerUserId, userId!),
    )).orderBy(desc(financeReceiptsTable.uploadedAt)),
  ]);
  const receiptsByExpense = new Map<number, any[]>();
  for (const receipt of receipts) {
    receiptsByExpense.set(receipt.expenseId, [...(receiptsByExpense.get(receipt.expenseId) ?? []), {
      id: receipt.id,
      originalName: receipt.originalName,
      extractionStatus: receipt.extractionStatus,
      fileUrl: `/api/finance/receipts/${receipt.id}/file`,
    }]);
  }
  const records = expenses
    .filter((expense) => inPeriod(expense.transactionDate, from, to))
    .filter((expense) => !category || (expense.category?.trim() || "Uncategorised") === category)
    .filter((expense) => !reviewStatus || expense.reviewStatus === reviewStatus)
    .filter((expense) => hasReceipt === undefined || Boolean(receiptsByExpense.get(expense.id)?.length) === hasReceipt)
    .map((expense) => ({ ...parseExpense(expense), receipts: receiptsByExpense.get(expense.id) ?? [] }));
  res.json(records);
});

router.post("/finance/expenses", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const body = req.body ?? {};
  if (body.transactionDate != null && !isDate(body.transactionDate)) {
    res.status(400).json({ error: "transactionDate must be YYYY-MM-DD" }); return;
  }
  if (body.jobId != null && !(await jobBelongsToUser(Number(body.jobId), userId!))) {
    res.status(400).json({ error: "Job does not belong to this business" }); return;
  }
  for (const field of ["grossAmount", "netAmount", "vatAmount"]) {
    if (body[field] != null && numberOrNull(body[field]) == null) {
      res.status(400).json({ error: `${field} must be a valid number` }); return;
    }
  }

  const completeEnough = Boolean(body.transactionDate) && numberOrNull(body.grossAmount) != null;
  const [expense] = await db.insert(financeExpensesTable).values({
    companyId: company.id,
    ownerUserId: userId!,
    jobId: body.jobId != null ? Number(body.jobId) : null,
    transactionDate: body.transactionDate ?? null,
    supplierName: typeof body.supplierName === "string" ? body.supplierName.trim() || null : null,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    category: typeof body.category === "string" ? body.category.trim() || null : null,
    grossAmount: moneyString(body.grossAmount),
    netAmount: moneyString(body.netAmount),
    vatAmount: moneyString(body.vatAmount),
    paymentMethod: typeof body.paymentMethod === "string" ? body.paymentMethod.trim() || null : null,
    source: "manual",
    reviewStatus: completeEnough ? "confirmed" : "needs_review",
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    createdByUserId: userId!,
    updatedByUserId: userId!,
  }).returning();
  await writeAudit({
    companyId: company.id, ownerUserId: userId!, entityType: "expense", entityId: expense.id,
    action: "created", actorUserId: userId!, afterData: parseExpense(expense),
  });
  res.status(201).json(parseExpense(expense));
});

router.patch("/finance/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  const id = Number(req.params.id);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid expense id" }); return; }
  const expense = await ownedExpense(id, company.id, userId!);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  const body = req.body ?? {};
  if (body.transactionDate !== undefined && body.transactionDate !== null && !isDate(body.transactionDate)) {
    res.status(400).json({ error: "transactionDate must be YYYY-MM-DD" }); return;
  }
  if (body.jobId !== undefined && body.jobId !== null && !(await jobBelongsToUser(Number(body.jobId), userId!))) {
    res.status(400).json({ error: "Job does not belong to this business" }); return;
  }
  const updates: Record<string, any> = { updatedByUserId: userId! };
  const directFields = ["transactionDate", "supplierName", "description", "category", "paymentMethod", "notes"];
  for (const field of directFields) if (body[field] !== undefined) updates[field] = body[field] || null;
  if (body.jobId !== undefined) updates.jobId = body.jobId == null || body.jobId === "" ? null : Number(body.jobId);
  for (const field of ["grossAmount", "netAmount", "vatAmount"]) {
    if (body[field] !== undefined) {
      if (body[field] != null && numberOrNull(body[field]) == null) {
        res.status(400).json({ error: `${field} must be a valid number` }); return;
      }
      updates[field] = moneyString(body[field]);
    }
  }
  const [updated] = await db.update(financeExpensesTable).set(updates)
    .where(and(eq(financeExpensesTable.id, id), eq(financeExpensesTable.companyId, company.id)))
    .returning();
  if (body.jobId !== undefined) {
    await db.update(financeReceiptsTable).set({ jobId: updated.jobId })
      .where(and(eq(financeReceiptsTable.expenseId, id), eq(financeReceiptsTable.companyId, company.id)));
  }
  await writeAudit({
    companyId: company.id, ownerUserId: userId!, entityType: "expense", entityId: id,
    action: "updated", actorUserId: userId!, beforeData: parseExpense(expense), afterData: parseExpense(updated),
  });
  res.json(parseExpense(updated));
});

router.post("/finance/expenses/:id/confirm", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  const id = Number(req.params.id);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid expense id" }); return; }
  const expense = await ownedExpense(id, company.id, userId!);
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  if (!expense.transactionDate || expense.grossAmount == null) {
    res.status(400).json({ error: "Add the transaction date and total before confirming this expense" }); return;
  }
  const status = req.body?.wasCorrected ? "corrected" : "confirmed";
  const [updated] = await db.update(financeExpensesTable).set({
    reviewStatus: status,
    updatedByUserId: userId!,
  }).where(and(eq(financeExpensesTable.id, id), eq(financeExpensesTable.companyId, company.id))).returning();
  await db.update(financeReceiptsTable).set({ reviewedAt: new Date(), reviewedByUserId: userId! })
    .where(and(eq(financeReceiptsTable.expenseId, id), eq(financeReceiptsTable.companyId, company.id)));
  await writeAudit({
    companyId: company.id, ownerUserId: userId!, entityType: "expense", entityId: id,
    action: status, actorUserId: userId!, beforeData: parseExpense(expense), afterData: parseExpense(updated),
  });
  res.json(parseExpense(updated));
});

// ── Receipt evidence and AI suggestions ────────────────────────────────────────

router.get("/finance/receipts", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const receipts = await db.select().from(financeReceiptsTable).where(and(
    eq(financeReceiptsTable.companyId, company.id),
    eq(financeReceiptsTable.ownerUserId, userId!),
  )).orderBy(desc(financeReceiptsTable.uploadedAt));
  res.json(receipts.map((receipt) => ({
    ...receipt,
    fileUrl: `/api/finance/receipts/${receipt.id}/file`,
  })));
});

router.get("/finance/receipts/:id/file", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  const id = Number(req.params.id);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const [receipt] = await db.select().from(financeReceiptsTable).where(and(
    eq(financeReceiptsTable.id, id),
    eq(financeReceiptsTable.companyId, company.id),
    eq(financeReceiptsTable.ownerUserId, userId!),
  )).limit(1);
  if (!receipt) { res.status(404).json({ error: "Receipt not found" }); return; }
  const buffer = await downloadBufferFromStorage(receipt.objectPath);
  res.setHeader("Content-Type", receipt.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${receipt.originalName.replace(/"/g, "")}"`);
  res.send(buffer);
});

router.post("/finance/receipts", requireAuth, receiptUpload.single("file"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const file = req.file;
  if (!file) { res.status(400).json({ error: "Attach a receipt file" }); return; }
  const jobId = req.body?.jobId ? Number(req.body.jobId) : null;
  if (jobId != null && !(await jobBelongsToUser(jobId, userId!))) {
    res.status(400).json({ error: "Job does not belong to this business" }); return;
  }
  const contentHash = createHash("sha256").update(file.buffer).digest("hex");
  const [duplicate] = await db.select({ id: financeReceiptsTable.id, expenseId: financeReceiptsTable.expenseId })
    .from(financeReceiptsTable)
    .where(and(eq(financeReceiptsTable.companyId, company.id), eq(financeReceiptsTable.contentHash, contentHash)))
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "This receipt has already been uploaded", receiptId: duplicate.id, expenseId: duplicate.expenseId });
    return;
  }

  const { objectPath } = await uploadBufferToStorage(file.buffer, file.mimetype, "finance");
  let expense: any;
  let receipt: any;
  try {
    [expense, receipt] = await db.transaction(async (tx) => {
      const [createdExpense] = await tx.insert(financeExpensesTable).values({
        companyId: company.id, ownerUserId: userId!, jobId,
        source: "receipt_upload", reviewStatus: "needs_review",
        createdByUserId: userId!, updatedByUserId: userId!,
      }).returning();
      const [createdReceipt] = await tx.insert(financeReceiptsTable).values({
        companyId: company.id, ownerUserId: userId!, expenseId: createdExpense.id, jobId,
        objectPath, originalName: file.originalname, mimeType: file.mimetype,
        fileSizeBytes: file.size, contentHash, extractionStatus: "processing",
        uploadedByUserId: userId!,
      }).returning();
      return [createdExpense, createdReceipt];
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      const [existing] = await db.select({ id: financeReceiptsTable.id, expenseId: financeReceiptsTable.expenseId })
        .from(financeReceiptsTable)
        .where(and(eq(financeReceiptsTable.companyId, company.id), eq(financeReceiptsTable.contentHash, contentHash)))
        .limit(1);
      res.status(409).json({
        error: "This receipt has already been uploaded",
        receiptId: existing?.id,
        expenseId: existing?.expenseId,
      });
      return;
    }
    throw error;
  }

  let savedExpense = expense;
  let savedReceipt: any = receipt;
  try {
    const extraction = await extractReceiptSuggestion(file.buffer, file.mimetype);
    const suggestion = extraction.suggestion;
    const rawExtraction = extraction.rawResponse && typeof extraction.rawResponse === "object" && !Array.isArray(extraction.rawResponse)
      ? extraction.rawResponse as Record<string, unknown>
      : { rawResponse: extraction.rawResponse };
    [savedExpense] = await db.update(financeExpensesTable).set({
      transactionDate: suggestion.transactionDate,
      supplierName: suggestion.supplierName,
      description: suggestion.description,
      category: suggestion.category,
      grossAmount: moneyString(suggestion.grossAmount),
      netAmount: moneyString(suggestion.netAmount),
      vatAmount: moneyString(suggestion.vatAmount),
      paymentMethod: suggestion.paymentMethod,
      reviewStatus: "ai_extracted",
      updatedByUserId: userId!,
    }).where(eq(financeExpensesTable.id, expense.id)).returning();
    [savedReceipt] = await db.update(financeReceiptsTable).set({
      extractionStatus: "completed",
      extractionMethod: extraction.method,
      extractedData: { ...rawExtraction, suggestion },
    }).where(eq(financeReceiptsTable.id, receipt.id)).returning();
  } catch (error) {
    [savedReceipt] = await db.update(financeReceiptsTable).set({
      extractionStatus: "failed",
    }).where(eq(financeReceiptsTable.id, receipt.id)).returning();
  }

  await writeAudit({
    companyId: company.id, ownerUserId: userId!, entityType: "receipt", entityId: receipt.id,
    action: "uploaded", actorUserId: userId!,
    afterData: { receiptId: receipt.id, expenseId: expense.id, extractionStatus: savedReceipt.extractionStatus },
  });
  res.status(201).json({
    expense: parseExpense(savedExpense),
    receipt: { ...savedReceipt, fileUrl: `/api/finance/receipts/${receipt.id}/file` },
    notice: "AI-extracted values are suggestions only and must be reviewed before they are included in tax preparation.",
  });
});

// ── Other income and audit trail ───────────────────────────────────────────────

router.get("/finance/income", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const { from, to } = periodQuery(req);
  res.json(await buildIncomeActivity(userId!, company.id, from, to));
});

router.post("/finance/income", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  const body = req.body ?? {};
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!isDate(body.receivedDate) || numberOrNull(body.grossAmount) == null || !String(body.description ?? "").trim()) {
    res.status(400).json({ error: "receivedDate, description, and grossAmount are required" }); return;
  }
  if (body.jobId != null && !(await jobBelongsToUser(Number(body.jobId), userId!))) {
    res.status(400).json({ error: "Job does not belong to this business" }); return;
  }
  const [income] = await db.insert(financeIncomeRecordsTable).values({
    companyId: company.id, ownerUserId: userId!, jobId: body.jobId != null ? Number(body.jobId) : null,
    receivedDate: body.receivedDate, description: String(body.description).trim(),
    category: typeof body.category === "string" ? body.category.trim() || null : null,
    grossAmount: moneyString(body.grossAmount)!,
    netAmount: moneyString(body.netAmount),
    vatAmount: moneyString(body.vatAmount),
    paymentMethod: typeof body.paymentMethod === "string" ? body.paymentMethod.trim() || null : null,
    source: "manual", notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    createdByUserId: userId!,
  }).returning();
  await writeAudit({
    companyId: company.id, ownerUserId: userId!, entityType: "income", entityId: income.id,
    action: "created", actorUserId: userId!, afterData: parseIncome(income),
  });
  res.status(201).json(parseIncome(income));
});

router.get("/finance/audit", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const events = await db.select().from(financeAuditEventsTable).where(and(
    eq(financeAuditEventsTable.companyId, company.id),
    eq(financeAuditEventsTable.ownerUserId, userId!),
  )).orderBy(desc(financeAuditEventsTable.createdAt)).limit(100);
  res.json(events);
});

export default router;