import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  db, enquiriesTable, quotesTable, jobsTable,
  jobProductionDocumentsTable,
  jobIntelligenceComponentsTable,
  jobIntelligenceInvoiceLinesTable,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import multer from "multer";
import { uploadBufferToStorage, storageServingUrl } from "../lib/storageUpload";
import { extractDocumentIntelligence, EXTRACTION_METHOD } from "../lib/intelligenceExtractor";
import { requireBillingFeature } from "../services/billing/authorization";

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
  const [row] = await db.insert(jobIntelligenceComponentsTable).values({
    jobId: id,
    documentId: Number(body.documentId),
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
    "extractionStatus",
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
