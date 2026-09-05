import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  db, enquiriesTable, quotesTable, jobsTable,
  jobProductionDocumentsTable,
  jobIntelligenceComponentsTable,
  jobIntelligenceInvoiceLinesTable,
  companiesTable, financeAuditEventsTable, financeReceiptsTable, financeExpensesTable,
  materialLibraryTable, materialCostHistoryTable, jobLabourEntriesTable, jobMaterialUsagesTable,
  jobOtherDirectCostsTable, jobFinanceAllocationsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, ilike, or, sql } from "drizzle-orm";
import multer from "multer";
import { uploadBufferToStorage, storageServingUrl } from "../lib/storageUpload";
import { extractDocumentIntelligence, EXTRACTION_METHOD } from "../lib/intelligenceExtractor";
import { requireBillingFeature } from "../services/billing/authorization";
import { buildJobEvidenceSummary, evidenceState, finiteNonNegative } from "../services/jobCostEvidence";
import { CreateMaterialBody } from "@workspace/api-zod";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function parseJob(j: any) {
  return {
    ...j,
    materialsAllowance: Number(j.materialsAllowance ?? 0),
    labourAllowance: Number(j.labourAllowance ?? 0),
    totalWithVat: Number(j.totalWithVat ?? 0),
    // Completion actuals — null if not recorded
    finalAmountCharged: j.finalAmountCharged != null ? Number(j.finalAmountCharged) : null,
    actualLabourHours: j.actualLabourHours != null ? Number(j.actualLabourHours) : null,
    actualLabourCost: j.actualLabourCost != null ? Number(j.actualLabourCost) : null,
    actualMaterialsCost: j.actualMaterialsCost != null ? Number(j.actualMaterialsCost) : null,
    variationAmount: j.variationAmount != null ? Number(j.variationAmount) : null,
  };
}

// ── Multer (memory) for completion photos → GCS ───────────────────────────────
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/** Verify that a job's enquiry belongs to the logged-in user. */
async function verifyJobOwnership(jobId: number, userId: string): Promise<{ job: typeof jobsTable.$inferSelect } | null> {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return null;

  const [enquiry] = await db
    .select({ ownerUserId: enquiriesTable.ownerUserId })
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, job.enquiryId), eq(enquiriesTable.ownerUserId, userId)));
  if (!enquiry) return null;

  return { job };
}

async function businessFor(userId: string) {
  const [company] = await db.select({ id: companiesTable.id }).from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId)).limit(1);
  return company ?? null;
}
async function audit(companyId: number, userId: string, entityType: string, entityId: number, action: string, beforeData?: unknown, afterData?: unknown) {
  await db.insert(financeAuditEventsTable).values({ companyId, ownerUserId: userId, entityType, entityId, action, actorUserId: userId, beforeData: beforeData ?? null, afterData: afterData ?? null });
}
function page(req: any) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25) || 25));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  return { limit, offset };
}
const numericFields = new Set(["estimatedHours", "actualHours", "hourlyCost", "estimatedCost", "actualCost", "estimatedQuantity", "actualQuantity", "wasteQuantity", "wastePercent", "estimatedUnitCost", "actualUnitCost", "allocatedAmount", "allocatedQuantity"]);
function validatedValues(body: any, fields: string[]) {
  const values: Record<string, any> = {};
  for (const field of fields) {
    if (body[field] === undefined) continue;
    if (numericFields.has(field)) {
      const error = finiteNonNegative(body[field], field);
      if (error) return { error };
      values[field] = body[field] == null || body[field] === "" ? null : String(Number(body[field]));
    } else values[field] = body[field] ?? null;
  }
  return { values };
}

// List all jobs (scoped to enquiries owned by this user)
router.get("/jobs", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  // Get this user's enquiry IDs
  const ownedEnquiries = await db
    .select({ id: enquiriesTable.id })
    .from(enquiriesTable)
    .where(eq(enquiriesTable.ownerUserId, userId!));

  if (ownedEnquiries.length === 0) {
    res.json([]);
    return;
  }

  const enquiryIds = ownedEnquiries.map((e) => e.id);
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(inArray(jobsTable.enquiryId, enquiryIds))
    .orderBy(jobsTable.createdAt);

  res.json(jobs.map(parseJob));
});

// Get single job
router.get("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  res.json(parseJob(owned.job));
});

// Create job
router.post("/jobs", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const body = req.body;
  if (!body?.enquiryId || !body?.customerName) {
    res.status(400).json({ error: "enquiryId and customerName are required" });
    return;
  }

  // Verify enquiry ownership
  const [enquiry] = await db
    .select({ id: enquiriesTable.id })
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, Number(body.enquiryId)), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  const [job] = await db
    .insert(jobsTable)
    .values({
      enquiryId: Number(body.enquiryId),
      quoteId: body.quoteId ? Number(body.quoteId) : null,
      customerName: body.customerName,
      customerEmail: body.customerEmail ?? null,
      customerPhone: body.customerPhone ?? null,
      location: body.location ?? null,
      projectType: body.projectType ?? null,
      projectDescription: body.projectDescription ?? null,
      materialsAllowance: String(body.materialsAllowance ?? 0),
      labourAllowance: String(body.labourAllowance ?? 0),
      totalWithVat: String(body.totalWithVat ?? 0),
      status: body.status ?? "Survey Required",
      installDate: body.installDate ?? null,
      assignedTeam: body.assignedTeam ?? null,
      notes: body.notes ?? null,
      aiSummary: body.aiSummary ?? null,
      attachmentUrls: body.attachmentUrls ?? null,
    })
    .returning();

  res.status(201).json(parseJob(job));
});

// Update job
router.patch("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  if (body.status !== undefined) updates.status = body.status;
  if (body.siteSurveyDate !== undefined) updates.siteSurveyDate = body.siteSurveyDate;
  if (body.installationStartDate !== undefined) updates.installationStartDate = body.installationStartDate;
  if (body.installationEndDate !== undefined) updates.installationEndDate = body.installationEndDate;
  if (body.installDate !== undefined) updates.installDate = body.installDate;
  if (body.assignedTeam !== undefined) updates.assignedTeam = body.assignedTeam;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.customerName !== undefined) updates.customerName = body.customerName;
  if (body.customerEmail !== undefined) updates.customerEmail = body.customerEmail;
  if (body.customerPhone !== undefined) updates.customerPhone = body.customerPhone;
  if (body.location !== undefined) updates.location = body.location;
  if (body.projectType !== undefined) updates.projectType = body.projectType;
  if (body.projectDescription !== undefined) updates.projectDescription = body.projectDescription;
  if (body.materialsAllowance !== undefined) updates.materialsAllowance = String(body.materialsAllowance);
  if (body.labourAllowance !== undefined) updates.labourAllowance = String(body.labourAllowance);
  if (body.totalWithVat !== undefined) updates.totalWithVat = String(body.totalWithVat);

  const [updated] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.id, id))
    .returning();

  res.json(parseJob(updated));
});

// Schedule a job (survey / install dates)
router.patch("/jobs/:id/schedule", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  if (body.siteSurveyDate !== undefined) updates.siteSurveyDate = body.siteSurveyDate || null;
  if (body.installationStartDate !== undefined) updates.installationStartDate = body.installationStartDate || null;
  if (body.installationEndDate !== undefined) updates.installationEndDate = body.installationEndDate || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [updated] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.id, id))
    .returning();

  res.json(parseJob(updated));
});

// Complete a job — record actuals, set status to Completed
router.post("/jobs/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const today = new Date().toISOString().slice(0, 10);
  for (const field of ["finalAmountCharged", "actualLabourHours", "actualLabourCost", "actualMaterialsCost", "variationAmount"]) {
    const error = finiteNonNegative(body[field], field);
    if (error) { res.status(400).json({ error }); return; }
  }

  const updates: Record<string, any> = {
    status: "Completed",
    completedAt: body.completedAt || today,
  };

  // Only store what was explicitly provided — do not invent costs
  if (body.finalAmountCharged != null && body.finalAmountCharged !== "") updates.finalAmountCharged = String(Number(body.finalAmountCharged));
  if (body.actualLabourHours != null && body.actualLabourHours !== "") updates.actualLabourHours = String(Number(body.actualLabourHours));
  if (body.actualLabourCost != null && body.actualLabourCost !== "") updates.actualLabourCost = String(Number(body.actualLabourCost));
  if (body.actualMaterialsCost != null && body.actualMaterialsCost !== "") updates.actualMaterialsCost = String(Number(body.actualMaterialsCost));
  if (body.variationAmount != null && body.variationAmount !== "") updates.variationAmount = String(Number(body.variationAmount));
  if (body.variationNote != null) updates.variationNote = String(body.variationNote);
  if (body.completionNotes != null) updates.completionNotes = String(body.completionNotes);

  const [updated] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.id, id))
    .returning();

  const company = await businessFor(userId!);
  if (company) await audit(company.id, userId!, "job_completion", id, "actuals_recorded", owned.job, updated);
  res.json(parseJob(updated));
});

// Upload a completion photo → GCS, append URL to completionPhotoUrls
router.post("/jobs/:id/completion-photos", requireAuth, memUpload.single("file"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  const { objectPath } = await uploadBufferToStorage(file.buffer, file.mimetype);
  const url = storageServingUrl(req, objectPath);

  // Append to completionPhotoUrls JSON array
  const existing: string[] = (() => {
    try { return JSON.parse((owned.job as any).completionPhotoUrls ?? "[]"); } catch { return []; }
  })();
  existing.push(url);

  const [updated] = await db
    .update(jobsTable)
    .set({ completionPhotoUrls: JSON.stringify(existing) })
    .where(eq(jobsTable.id, id))
    .returning();

  res.status(201).json({ url, job: parseJob(updated) });
});

// ── Multer for production documents (images + common doc formats, 50 MB) ─────
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

// List production documents for a job
router.get("/jobs/:id/production-documents", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const docs = await db
    .select()
    .from(jobProductionDocumentsTable)
    .where(eq(jobProductionDocumentsTable.jobId, id))
    .orderBy(desc(jobProductionDocumentsTable.uploadedAt));

  res.json(docs);
});

// Upload a production document → GCS → extract intelligence → insert rows
router.post("/jobs/:id/production-documents", requireAuth, requireBillingFeature("cost_intelligence"), docUpload.single("file"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  const docType = String(req.body?.docType ?? "other");
  const validTypes = ["cutting_list", "bill_of_materials", "drawings", "supplier_invoice", "other"];
  if (!validTypes.includes(docType)) { res.status(400).json({ error: "Invalid docType" }); return; }

  // Save file to GCS first
  const { objectPath } = await uploadBufferToStorage(file.buffer, file.mimetype);
  const url = storageServingUrl(req, objectPath);

  // Determine if this doc type can be extracted
  const extractable = ["cutting_list", "bill_of_materials", "supplier_invoice"].includes(docType);
  const initialExtractionStatus = extractable ? "processing" : "not_applicable";

  const [doc] = await db
    .insert(jobProductionDocumentsTable)
    .values({
      jobId: id,
      url,
      objectPath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      docType,
      fileSizeBytes: file.size,
      uploadedByUserId: userId,
      extractionStatus: initialExtractionStatus,
    })
    .returning();

  if (!extractable) {
    res.status(201).json({ ...doc, extractedComponentCount: 0, extractedInvoiceLineCount: 0 });
    return;
  }

  // Run extraction synchronously (buffer is still in memory)
  let extractedComponentCount = 0;
  let extractedInvoiceLineCount = 0;
  try {
    const result = await extractDocumentIntelligence(file.buffer, file.mimetype, docType);

    // Store raw AI response in extracted_data (audit trail)
    const updateValues: Record<string, any> = {
      extractionStatus: "completed",
      extractionTimestamp: new Date(),
      extractionMethod: result.method,
      extractedData: result.rawResponse ?? null,
    };

    if (result.components?.length) {
      const rows = result.components.map(c => ({
        jobId: id,
        documentId: doc.id,
        itemName: c.item_name,
        quantity: c.quantity != null ? String(c.quantity) : null,
        finishedLengthMm: c.finished_length_mm != null ? String(c.finished_length_mm) : null,
        finishedWidthMm: c.finished_width_mm != null ? String(c.finished_width_mm) : null,
        finishedThicknessMm: c.finished_thickness_mm != null ? String(c.finished_thickness_mm) : null,
        sawnLengthMm: c.sawn_length_mm != null ? String(c.sawn_length_mm) : null,
        sawnWidthMm: c.sawn_width_mm != null ? String(c.sawn_width_mm) : null,
        sawnThicknessMm: c.sawn_thickness_mm != null ? String(c.sawn_thickness_mm) : null,
        material: c.material,
        timberSpecies: c.timber_species,
        timberGrade: c.timber_grade,
        boardType: c.board_type,
        sheetFinish: c.sheet_finish,
        hardwareRef: c.hardware_ref,
        supplierRef: c.supplier_ref,
        unitCost: c.unit_cost != null ? String(c.unit_cost) : null,
        totalCost: c.total_cost != null ? String(c.total_cost) : null,
        notes: c.notes,
        extractionStatus: "ai_extracted" as const,
        confidenceScore: c.confidence_score != null ? String(c.confidence_score) : null,
        originalExtractedText: c.original_extracted_text,
      }));
      await db.insert(jobIntelligenceComponentsTable).values(rows);
      extractedComponentCount = rows.length;
    }

    if (result.invoiceLines?.length) {
      const rows = result.invoiceLines.map(l => ({
        jobId: id,
        documentId: doc.id,
        supplierName: l.supplier_name,
        invoiceNumber: l.invoice_number,
        invoiceDate: l.invoice_date,
        itemDescription: l.item_description,
        quantity: l.quantity != null ? String(l.quantity) : null,
        unit: l.unit,
        unitPrice: l.unit_price != null ? String(l.unit_price) : null,
        lineTotal: l.line_total != null ? String(l.line_total) : null,
        vatAmount: l.vat_amount != null ? String(l.vat_amount) : null,
        materialCategory: l.material_category,
        productRef: l.product_ref,
        extractionStatus: "ai_extracted" as const,
        confidenceScore: l.confidence_score != null ? String(l.confidence_score) : null,
        originalExtractedText: l.original_extracted_text,
      }));
      await db.insert(jobIntelligenceInvoiceLinesTable).values(rows);
      extractedInvoiceLineCount = rows.length;
    }

    await db.update(jobProductionDocumentsTable).set(updateValues).where(eq(jobProductionDocumentsTable.id, doc.id));
    res.status(201).json({ ...doc, ...updateValues, extractedComponentCount, extractedInvoiceLineCount });
  } catch (err: any) {
    // Extraction failed — document is still saved, just mark status
    await db.update(jobProductionDocumentsTable)
      .set({ extractionStatus: "failed" })
      .where(eq(jobProductionDocumentsTable.id, doc.id));
    res.status(201).json({ ...doc, extractionStatus: "failed", extractedComponentCount: 0, extractedInvoiceLineCount: 0 });
  }
});

// ── Intelligence: GET all extracted data for a job ────────────────────────────
router.get("/jobs/:id/intelligence", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const [components, invoiceLines] = await Promise.all([
    db.select().from(jobIntelligenceComponentsTable)
      .where(eq(jobIntelligenceComponentsTable.jobId, id))
      .orderBy(jobIntelligenceComponentsTable.documentId, jobIntelligenceComponentsTable.id),
    db.select().from(jobIntelligenceInvoiceLinesTable)
      .where(eq(jobIntelligenceInvoiceLinesTable.jobId, id))
      .orderBy(jobIntelligenceInvoiceLinesTable.documentId, jobIntelligenceInvoiceLinesTable.id),
  ]);

  res.json({ components, invoiceLines });
});

// ── Intelligence: components CRUD ─────────────────────────────────────────────

// Add a component manually
router.post("/jobs/:id/intelligence/components", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const documentId = Number(body.documentId);
  const [document] = await db.select({ id: jobProductionDocumentsTable.id }).from(jobProductionDocumentsTable)
    .where(and(eq(jobProductionDocumentsTable.id, documentId), eq(jobProductionDocumentsTable.jobId, id))).limit(1);
  if (!document) { res.status(404).json({ error: "Production document not found for this job" }); return; }
  const [row] = await db.insert(jobIntelligenceComponentsTable).values({
    jobId: id,
    documentId,
    extractionStatus: body.extractionStatus ?? "manually_added",
    itemName: body.itemName ?? null,
  }).returning();

  res.status(201).json(row);
});

// Update a component (review / correction)
router.put("/jobs/:id/intelligence/components/:rowId", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  if (isNaN(id) || isNaN(rowId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  // Allow updating any intelligence field
  const fields = [
    "itemName","quantity","finishedLengthMm","finishedWidthMm","finishedThicknessMm",
    "sawnLengthMm","sawnWidthMm","sawnThicknessMm","material","timberSpecies","timberGrade",
    "boardType","sheetFinish","hardwareRef","supplierRef","unitCost","totalCost","notes",
    "unit","specification","attributes","estimatedQuantity","actualQuantity","estimatedCost","actualCost",
    "wasteQuantity","wastePercent","extractionStatus",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f] || null;
  }
  if (body.extractionStatus === "corrected" || (body.extractionStatus && body.extractionStatus !== "ai_extracted")) {
    updates.correctedAt = new Date();
  }

  const [updated] = await db.update(jobIntelligenceComponentsTable)
    .set(updates)
    .where(and(eq(jobIntelligenceComponentsTable.id, rowId), eq(jobIntelligenceComponentsTable.jobId, id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Row not found" }); return; }
  res.json(updated);
});

// Delete a component
router.delete("/jobs/:id/intelligence/components/:rowId", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  if (isNaN(id) || isNaN(rowId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  await db.delete(jobIntelligenceComponentsTable)
    .where(and(eq(jobIntelligenceComponentsTable.id, rowId), eq(jobIntelligenceComponentsTable.jobId, id)));

  res.json({ deleted: true });
});

// ── Intelligence: invoice lines CRUD ──────────────────────────────────────────

// Add an invoice line manually
router.post("/jobs/:id/intelligence/invoice-lines", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const [row] = await db.insert(jobIntelligenceInvoiceLinesTable).values({
    jobId: id,
    documentId: Number(body.documentId),
    extractionStatus: body.extractionStatus ?? "manually_added",
    itemDescription: body.itemDescription ?? null,
  }).returning();

  res.status(201).json(row);
});

// Update an invoice line
router.put("/jobs/:id/intelligence/invoice-lines/:rowId", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  if (isNaN(id) || isNaN(rowId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  const fields = [
    "supplierName","invoiceNumber","invoiceDate","itemDescription","quantity",
    "unit","unitPrice","lineTotal","vatAmount","materialCategory","productRef","extractionStatus",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f] || null;
  }
  if (body.extractionStatus === "corrected" || (body.extractionStatus && body.extractionStatus !== "ai_extracted")) {
    updates.correctedAt = new Date();
  }

  const [updated] = await db.update(jobIntelligenceInvoiceLinesTable)
    .set(updates)
    .where(and(eq(jobIntelligenceInvoiceLinesTable.id, rowId), eq(jobIntelligenceInvoiceLinesTable.jobId, id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Row not found" }); return; }
  res.json(updated);
});

// Delete an invoice line
router.delete("/jobs/:id/intelligence/invoice-lines/:rowId", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const rowId = Number(req.params.rowId);
  if (isNaN(id) || isNaN(rowId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  await db.delete(jobIntelligenceInvoiceLinesTable)
    .where(and(eq(jobIntelligenceInvoiceLinesTable.id, rowId), eq(jobIntelligenceInvoiceLinesTable.jobId, id)));

  res.json({ deleted: true });
});

// Delete a production document
router.delete("/jobs/:id/production-documents/:docId", requireAuth, requireBillingFeature("cost_intelligence"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const docId = Number(req.params.docId);
  if (isNaN(id) || isNaN(docId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }

  const [deleted] = await db
    .delete(jobProductionDocumentsTable)
    .where(and(
      eq(jobProductionDocumentsTable.id, docId),
      eq(jobProductionDocumentsTable.jobId, id),
    ))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Document not found" }); return; }
  res.status(200).json({ deleted: true });
});

// Convert enquiry → job
// ── Private actual-cost evidence ─────────────────────────────────────────────
router.get("/jobs/:id/evidence-summary", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const owned = await verifyJobOwnership(id, userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }
  const [labour, materials, otherDirectCosts, allocations, documents, components] = await Promise.all([
    db.select().from(jobLabourEntriesTable).where(eq(jobLabourEntriesTable.jobId, id)),
    db.select().from(jobMaterialUsagesTable).where(eq(jobMaterialUsagesTable.jobId, id)),
    db.select().from(jobOtherDirectCostsTable).where(eq(jobOtherDirectCostsTable.jobId, id)),
    db.select().from(jobFinanceAllocationsTable).where(eq(jobFinanceAllocationsTable.jobId, id)),
    db.select().from(jobProductionDocumentsTable).where(eq(jobProductionDocumentsTable.jobId, id)),
    db.select().from(jobIntelligenceComponentsTable).where(eq(jobIntelligenceComponentsTable.jobId, id)),
  ]);
  res.json({ job: parseJob(owned.job), ...buildJobEvidenceSummary({ job: owned.job, labour, materials, otherDirectCosts, allocations, documents, components }), counts: { labour: labour.length, materials: materials.length, otherDirectCosts: otherDirectCosts.length, allocations: allocations.length, documents: documents.length, components: components.length } });
});

async function ownedEvidenceContext(req: any, res: any) {
  const { userId } = getAuth(req); const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId)) { res.status(400).json({ error: "Invalid job id" }); return null; }
  const [owned, company] = await Promise.all([verifyJobOwnership(jobId, userId!), businessFor(userId!)]);
  if (!owned || !company) { res.status(404).json({ error: "Job or business not found" }); return null; }
  return { jobId, userId: userId!, companyId: company.id };
}
async function sourceOwned(body: any, companyId: number, userId: string) {
  if (body.materialId != null) {
    const [row] = await db.select({ id: materialLibraryTable.id }).from(materialLibraryTable).where(and(eq(materialLibraryTable.id, Number(body.materialId)), eq(materialLibraryTable.companyId, companyId), eq(materialLibraryTable.ownerUserId, userId)));
    if (!row) return false;
  }
  for (const [key, table] of [["sourceReceiptId", financeReceiptsTable], ["receiptId", financeReceiptsTable], ["sourceExpenseId", financeExpensesTable], ["expenseId", financeExpensesTable]] as const) {
    if (body[key] != null) {
      const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, Number(body[key])), eq(table.companyId, companyId), eq(table.ownerUserId, userId))).limit(1);
      if (!row) return false;
    }
  }
  if (body.sourceDocumentId != null) {
    const [row] = await db.select({ id: jobProductionDocumentsTable.id }).from(jobProductionDocumentsTable)
      .where(and(eq(jobProductionDocumentsTable.id, Number(body.sourceDocumentId)), eq(jobProductionDocumentsTable.jobId, Number(body.jobId ?? -1)))).limit(1);
    if (!row) return false;
  }
  return true;
}
const evidenceDefinitions: Record<string, { table: any; fields: string[]; name: string }> = {
  labour: { table: jobLabourEntriesTable, name: "labour entry", fields: ["workDate", "personName", "personReference", "entryType", "estimatedHours", "actualHours", "hourlyCost", "estimatedCost", "actualCost", "notes", "sourceType", "sourceDocumentId", "sourceReceiptId", "sourceExpenseId", "extractionMethod", "confidenceScore"] },
  materials: { table: jobMaterialUsagesTable, name: "material usage", fields: ["materialId", "name", "supplierName", "supplierSku", "unit", "specification", "attributes", "estimatedQuantity", "actualQuantity", "wasteQuantity", "wastePercent", "estimatedUnitCost", "actualUnitCost", "estimatedCost", "actualCost", "notes", "sourceType", "sourceDocumentId", "sourceReceiptId", "sourceExpenseId", "extractionMethod", "confidenceScore"] },
  "other-costs": { table: jobOtherDirectCostsTable, name: "direct cost", fields: ["description", "category", "estimatedCost", "actualCost", "notes", "sourceType", "sourceDocumentId", "sourceReceiptId", "sourceExpenseId", "extractionMethod", "confidenceScore"] },
};

function evidenceInput(path: string, body: any) {
  const shared = {
    notes: body.notes,
    sourceType: body.sourceType,
    sourceDocumentId: body.sourceDocumentId,
    sourceReceiptId: body.sourceReceiptId,
    sourceExpenseId: body.sourceExpenseId,
    extractionMethod: body.extractionMethod,
    confidenceScore: body.confidenceScore,
  };
  if (path === "labour") return {
    ...body, ...shared,
    entryType: body.entryType ?? body.description,
    actualCost: body.actualCost ?? body.amount,
    actualHours: body.actualHours ?? body.quantity,
    workDate: body.workDate ?? body.date,
  };
  if (path === "materials") return {
    ...body, ...shared,
    name: body.name ?? body.description,
    actualCost: body.actualCost ?? body.amount,
    actualQuantity: body.actualQuantity ?? body.quantity,
    actualUnitCost: body.actualUnitCost ?? (
      Number(body.quantity) > 0 && body.amount != null
        ? Number(body.amount) / Number(body.quantity)
        : undefined
    ),
    supplierSku: body.supplierSku ?? body.reference,
  };
  return {
    ...body, ...shared,
    actualCost: body.actualCost ?? body.amount,
  };
}

function evidenceOutput(path: string, row: any) {
  if (path === "labour") return {
    ...row,
    kind: path,
    description: row.entryType ?? row.personName,
    amount: row.actualCost,
    quantity: row.actualHours,
    date: row.workDate,
    reference: row.personReference,
    sourceLabel: row.sourceType,
    provenance: row.extractionMethod,
  };
  if (path === "materials") return {
    ...row,
    kind: path,
    description: row.name,
    amount: row.actualCost,
    quantity: row.actualQuantity,
    reference: row.supplierSku,
    sourceLabel: row.sourceType,
    provenance: row.extractionMethod,
  };
  return {
    ...row,
    kind: path,
    amount: row.actualCost,
    sourceLabel: row.sourceType,
    provenance: row.extractionMethod,
  };
}

for (const [path, def] of Object.entries(evidenceDefinitions)) {
  router.get(`/jobs/:id/evidence/${path}`, requireAuth, async (req, res): Promise<void> => {
    const ctx = await ownedEvidenceContext(req, res); if (!ctx) return; const { limit, offset } = page(req);
    const rows = await db.select().from(def.table).where(and(eq(def.table.jobId, ctx.jobId), eq(def.table.companyId, ctx.companyId))).orderBy(desc(def.table.createdAt)).limit(limit).offset(offset);
    res.json({ items: rows.map((row) => evidenceOutput(path, row)), limit, offset });
  });
  router.post(`/jobs/:id/evidence/${path}`, requireAuth, async (req, res): Promise<void> => {
    const ctx = await ownedEvidenceContext(req, res); if (!ctx) return; const body = evidenceInput(path, req.body ?? {});
    const parsed = validatedValues(body, def.fields); if (parsed.error) { res.status(400).json({ error: parsed.error }); return; }
    if (path === "materials" && typeof body.name !== "string") { res.status(400).json({ error: "name is required" }); return; }
    if (path === "other-costs" && typeof body.description !== "string") { res.status(400).json({ error: "description is required" }); return; }
    if (!(await sourceOwned({ ...body, jobId: ctx.jobId }, ctx.companyId, ctx.userId))) { res.status(404).json({ error: "Referenced evidence is not owned by this business/job" }); return; }
    const state = evidenceState(body.sourceType, body.confirmationState);
    const createdRows: any[] = await db.insert(def.table).values({ ...parsed.values, jobId: ctx.jobId, companyId: ctx.companyId, ownerUserId: ctx.userId, confirmationState: state, confirmedByUserId: state === "confirmed" ? ctx.userId : null, confirmedAt: state === "confirmed" ? new Date() : null, createdByUserId: ctx.userId, updatedByUserId: ctx.userId }).returning() as any;
    const row = createdRows[0];
    if (path === "materials" && state === "confirmed" && row.materialId != null && row.actualUnitCost != null) {
      const [history] = await db.insert(materialCostHistoryTable).values({
        materialId: row.materialId, companyId: ctx.companyId, ownerUserId: ctx.userId,
        unitCost: row.actualUnitCost, totalCost: row.actualCost, quantity: row.actualQuantity,
        unit: row.unit, supplierName: row.supplierName, sourceType: row.sourceType,
        sourceDocumentId: row.sourceDocumentId, sourceReceiptId: row.sourceReceiptId, sourceExpenseId: row.sourceExpenseId,
        extractionMethod: row.extractionMethod, confidenceScore: row.confidenceScore,
        confirmedByUserId: ctx.userId,
      }).returning();
      await db.update(materialLibraryTable).set({
        latestConfirmedUnitCost: history.unitCost, latestConfirmedTotalCost: history.totalCost,
        latestConfirmedAt: history.confirmedAt, latestSourceType: history.sourceType,
        latestSourceDocumentId: history.sourceDocumentId, latestSourceReceiptId: history.sourceReceiptId,
        latestSourceExpenseId: history.sourceExpenseId, updatedByUserId: ctx.userId,
      }).where(and(eq(materialLibraryTable.id, row.materialId), eq(materialLibraryTable.companyId, ctx.companyId), eq(materialLibraryTable.ownerUserId, ctx.userId)));
    }
    if (state === "confirmed") await audit(ctx.companyId, ctx.userId, path, row.id, "created_confirmed", undefined, row);
    res.status(201).json(evidenceOutput(path, row));
  });
  router.patch(`/jobs/:id/evidence/${path}/:rowId`, requireAuth, async (req, res): Promise<void> => {
    const ctx = await ownedEvidenceContext(req, res); const rowId = Number(req.params.rowId); if (!ctx) return;
    if (!Number.isInteger(rowId)) { res.status(400).json({ error: "Invalid evidence id" }); return; }
    const [before] = await db.select().from(def.table).where(and(eq(def.table.id, rowId), eq(def.table.jobId, ctx.jobId), eq(def.table.companyId, ctx.companyId)));
    if (!before) { res.status(404).json({ error: `${def.name} not found` }); return; }
    const body = evidenceInput(path, req.body ?? {});
    const parsed = validatedValues(body, def.fields); if (parsed.error) { res.status(400).json({ error: parsed.error }); return; }
    if (!(await sourceOwned({ ...body, jobId: ctx.jobId }, ctx.companyId, ctx.userId))) { res.status(404).json({ error: "Referenced evidence is not owned by this business/job" }); return; }
    const [row] = await db.update(def.table).set({ ...parsed.values, updatedByUserId: ctx.userId }).where(eq(def.table.id, rowId)).returning();
    await audit(ctx.companyId, ctx.userId, path, rowId, "corrected", before, row); res.json(evidenceOutput(path, row));
  });
  router.post(`/jobs/:id/evidence/${path}/:rowId/:action`, requireAuth, async (req, res): Promise<void> => {
    const ctx = await ownedEvidenceContext(req, res); const rowId = Number(req.params.rowId); const action = req.params.action;
    if (!ctx || !Number.isInteger(rowId) || (action !== "confirm" && action !== "ignore")) { if (ctx) res.status(400).json({ error: "Invalid evidence action or id" }); return; }
    const [before] = await db.select().from(def.table).where(and(eq(def.table.id, rowId), eq(def.table.jobId, ctx.jobId), eq(def.table.companyId, ctx.companyId)));
    if (!before) { res.status(404).json({ error: `${def.name} not found` }); return; }
    const state = action === "confirm" ? "confirmed" : "ignored";
    if (state === "confirmed" && before.confirmationState === "confirmed") {
      res.json(evidenceOutput(path, before));
      return;
    }
    const [row] = await db.update(def.table).set({ confirmationState: state, confirmedByUserId: ctx.userId, confirmedAt: new Date(), updatedByUserId: ctx.userId }).where(eq(def.table.id, rowId)).returning();
    // A price is reusable only after explicit confirmation. History is append-only:
    // the library summary is a denormalized latest observation, never a replacement.
    if (path === "materials" && state === "confirmed" && row.materialId != null && row.actualUnitCost != null) {
      const [history] = await db.insert(materialCostHistoryTable).values({
        materialId: row.materialId, companyId: ctx.companyId, ownerUserId: ctx.userId,
        unitCost: row.actualUnitCost, totalCost: row.actualCost, quantity: row.actualQuantity,
        unit: row.unit, supplierName: row.supplierName, sourceType: row.sourceType,
        sourceDocumentId: row.sourceDocumentId, sourceReceiptId: row.sourceReceiptId, sourceExpenseId: row.sourceExpenseId,
        extractionMethod: row.extractionMethod, confidenceScore: row.confidenceScore,
        confirmedByUserId: ctx.userId,
      }).returning();
      await db.update(materialLibraryTable).set({
        latestConfirmedUnitCost: history.unitCost, latestConfirmedTotalCost: history.totalCost,
        latestConfirmedAt: history.confirmedAt, latestSourceType: history.sourceType,
        latestSourceDocumentId: history.sourceDocumentId, latestSourceReceiptId: history.sourceReceiptId,
        latestSourceExpenseId: history.sourceExpenseId, updatedByUserId: ctx.userId,
      }).where(and(eq(materialLibraryTable.id, row.materialId), eq(materialLibraryTable.companyId, ctx.companyId), eq(materialLibraryTable.ownerUserId, ctx.userId)));
    }
    await audit(ctx.companyId, ctx.userId, path, rowId, state, before, row);
    res.json(evidenceOutput(path, row));
  });
}

router.get("/materials", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const { limit, offset } = page(req); const query = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const condition = and(eq(materialLibraryTable.companyId, company.id), eq(materialLibraryTable.ownerUserId, userId!), query ? or(ilike(materialLibraryTable.name, `%${query}%`), ilike(materialLibraryTable.supplierName, `%${query}%`), ilike(materialLibraryTable.supplierSku, `%${query}%`)) : undefined);
  const items = await db.select().from(materialLibraryTable).where(condition).orderBy(materialLibraryTable.name).limit(limit).offset(offset);
  res.json({ items, limit, offset });
});
router.post("/materials", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!); const body = req.body ?? {};
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const parsed = CreateMaterialBody.safeParse(body);
  if (!parsed.success || !parsed.data.name.trim()) { res.status(400).json({ error: parsed.success ? "name is required" : parsed.error.message }); return; }
  const [row] = await db.insert(materialLibraryTable).values({ companyId: company.id, ownerUserId: userId!, name: parsed.data.name.trim(), category: parsed.data.category ?? null, supplierName: parsed.data.supplierName ?? null, supplierSku: parsed.data.supplierSku ?? null, unit: parsed.data.unit ?? null, attributes: parsed.data.attributes ?? null, createdByUserId: userId!, updatedByUserId: userId! }).returning();
  res.status(201).json(row);
});
router.patch("/materials/:materialId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!); const id = Number(req.params.materialId);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid material id" }); return; }
  const fields = ["name", "category", "supplierName", "supplierSku", "unit", "attributes", "active"];
  const values: any = { updatedByUserId: userId! }; for (const field of fields) if (req.body?.[field] !== undefined) values[field] = req.body[field];
  const [row] = await db.update(materialLibraryTable).set(values).where(and(eq(materialLibraryTable.id, id), eq(materialLibraryTable.companyId, company.id), eq(materialLibraryTable.ownerUserId, userId!))).returning();
  if (!row) { res.status(404).json({ error: "Material not found" }); return; } res.json(row);
});
router.get("/materials/:materialId/history", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!); const id = Number(req.params.materialId);
  if (!company || !Number.isInteger(id)) { res.status(400).json({ error: "Invalid material or business" }); return; }
  const items = await db.select().from(materialCostHistoryTable).where(and(eq(materialCostHistoryTable.materialId, id), eq(materialCostHistoryTable.companyId, company.id), eq(materialCostHistoryTable.ownerUserId, userId!))).orderBy(desc(materialCostHistoryTable.confirmedAt));
  res.json({ items });
});

router.get("/jobs/:id/finance-allocations", requireAuth, async (req, res): Promise<void> => {
  const ctx = await ownedEvidenceContext(req, res); if (!ctx) return;
  res.json(await db.select().from(jobFinanceAllocationsTable).where(and(eq(jobFinanceAllocationsTable.jobId, ctx.jobId), eq(jobFinanceAllocationsTable.companyId, ctx.companyId))).orderBy(desc(jobFinanceAllocationsTable.createdAt)));
});
router.post("/jobs/:id/finance-allocations", requireAuth, async (req, res): Promise<void> => {
  const ctx = await ownedEvidenceContext(req, res); if (!ctx) return; const body = req.body ?? {};
  const error = finiteNonNegative(body.allocatedAmount, "allocatedAmount", true) ?? finiteNonNegative(body.allocatedQuantity, "allocatedQuantity");
  if (error) { res.status(400).json({ error }); return; }
  if ((body.receiptId == null && body.expenseId == null) || !(await sourceOwned(body, ctx.companyId, ctx.userId))) { res.status(404).json({ error: "A tenant-owned receipt or expense is required" }); return; }
  const sourceId = Number(body.receiptId ?? body.expenseId); const isReceipt = body.receiptId != null;
  const source = isReceipt
    ? (await db.select({ gross: financeExpensesTable.grossAmount }).from(financeReceiptsTable).innerJoin(financeExpensesTable, eq(financeReceiptsTable.expenseId, financeExpensesTable.id)).where(eq(financeReceiptsTable.id, sourceId)))[0]
    : (await db.select({ gross: financeExpensesTable.grossAmount }).from(financeExpensesTable).where(eq(financeExpensesTable.id, sourceId)))[0];
  const allocations = await db.select().from(jobFinanceAllocationsTable).where(isReceipt ? eq(jobFinanceAllocationsTable.receiptId, sourceId) : eq(jobFinanceAllocationsTable.expenseId, sourceId));
  const used = allocations.reduce((total, row) => total + Number(row.allocatedAmount), 0);
  if (source?.gross == null || used + Number(body.allocatedAmount) > Number(source.gross) + 0.00001) { res.status(400).json({ error: "Allocation exceeds the source gross amount or source total is unknown" }); return; }
  const [row] = await db.insert(jobFinanceAllocationsTable).values({ jobId: ctx.jobId, companyId: ctx.companyId, ownerUserId: ctx.userId, receiptId: body.receiptId == null ? null : Number(body.receiptId), expenseId: body.expenseId == null ? null : Number(body.expenseId), receiptLineReference: body.receiptLineReference ?? null, allocatedAmount: String(Number(body.allocatedAmount)), allocatedQuantity: body.allocatedQuantity == null ? null : String(Number(body.allocatedQuantity)), unit: body.unit ?? null, notes: body.notes ?? null, confirmationState: "confirmed", confirmedByUserId: ctx.userId, confirmedAt: new Date(), createdByUserId: ctx.userId, updatedByUserId: ctx.userId }).returning();
  await audit(ctx.companyId, ctx.userId, "finance_allocation", row.id, "created_confirmed", undefined, row); res.status(201).json(row);
});
router.delete("/jobs/:id/finance-allocations/:allocationId", requireAuth, async (req, res): Promise<void> => {
  const ctx = await ownedEvidenceContext(req, res); const allocationId = Number(req.params.allocationId);
  if (!ctx) return;
  if (!Number.isInteger(allocationId)) { res.status(400).json({ error: "Invalid allocation id" }); return; }
  const [before] = await db.select().from(jobFinanceAllocationsTable).where(and(eq(jobFinanceAllocationsTable.id, allocationId), eq(jobFinanceAllocationsTable.jobId, ctx.jobId), eq(jobFinanceAllocationsTable.companyId, ctx.companyId)));
  if (!before) { res.status(404).json({ error: "Allocation not found" }); return; }
  await db.delete(jobFinanceAllocationsTable).where(eq(jobFinanceAllocationsTable.id, allocationId));
  await audit(ctx.companyId, ctx.userId, "finance_allocation", allocationId, "deleted", before);
  res.status(204).send();
});
router.post("/enquiries/:id/convert-to-job", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const enquiryId = Number(req.params.id);
  if (isNaN(enquiryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Check enquiry exists and is owned
  const [enquiry] = await db
    .select()
    .from(enquiriesTable)
    .where(and(eq(enquiriesTable.id, enquiryId), eq(enquiriesTable.ownerUserId, userId!)));
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }

  // Idempotency: if a job already exists for this enquiry, return it as success (200).
  // This ensures that retry attempts (e.g. after a lost response) are safe and the
  // mobile client never gets stuck in an error loop for an already-completed conversion.
  const [existingJob] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.enquiryId, enquiryId));
  if (existingJob) {
    res.status(200).json(parseJob(existingJob));
    return;
  }

  // Get quote if available
  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, enquiryId));

  // Atomic insert — ON CONFLICT ensures concurrent requests don't create duplicate jobs.
  // If another request races to the same insert, DO NOTHING returns an empty array and
  // we fall back to fetching the winner's row below.
  const [inserted] = await db
    .insert(jobsTable)
    .values({
      enquiryId,
      quoteId: quote?.id ?? null,
      customerName: enquiry.customerName,
      customerEmail: enquiry.customerEmail ?? null,
      customerPhone: enquiry.customerPhone ?? null,
      location: enquiry.location ?? null,
      projectType: enquiry.projectType ?? null,
      projectDescription: quote?.projectDescription ?? enquiry.description ?? null,
      materialsAllowance: quote?.materialsAllowance ?? "0",
      labourAllowance: quote?.labourAllowance ?? "0",
      totalWithVat: quote?.totalWithVat ?? "0",
      status: "Survey Required",
      notes: quote?.notes ?? null,
      aiSummary: enquiry.aiSummary ?? null,
      attachmentUrls: enquiry.attachmentUrls ?? null,
    })
    .onConflictDoNothing({ target: jobsTable.enquiryId })
    .returning();

  // Whether we inserted or hit the conflict, return the canonical job row.
  const job = inserted ?? (await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.enquiryId, enquiryId))
    .then(rows => rows[0]));

  // Mark enquiry as won (idempotent update)
  await db
    .update(enquiriesTable)
    .set({ status: "won" })
    .where(eq(enquiriesTable.id, enquiryId));

  res.status(200).json(parseJob(job));
});

export default router;
