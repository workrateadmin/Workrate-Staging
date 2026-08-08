import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, quotesTable, jobsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

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
  };
}

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

  // Check if job already exists for this enquiry
  const [existingJob] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.enquiryId, enquiryId));
  if (existingJob) {
    res.status(409).json({ error: "A job already exists for this enquiry", jobId: existingJob.id });
    return;
  }

  // Get quote if available
  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.enquiryId, enquiryId));

  const [job] = await db
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
    .returning();

  // Mark enquiry as won
  await db
    .update(enquiriesTable)
    .set({ status: "won" })
    .where(eq(enquiriesTable.id, enquiryId));

  res.status(201).json(parseJob(job));
});

export default router;
