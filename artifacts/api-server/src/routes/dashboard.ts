import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, quotesTable, enquiryAttachmentsTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

router.get("/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const [allEnquiries, recentEnquiriesRaw, quotes] = await Promise.all([
    db.select({ status: enquiriesTable.status }).from(enquiriesTable),
    db
      .select()
      .from(enquiriesTable)
      .orderBy(desc(enquiriesTable.createdAt))
      .limit(5),
    db.select({ estimatedTotal: quotesTable.estimatedTotal }).from(quotesTable),
  ]);

  // Batch-fetch attachment counts for recent enquiries
  const recentIds = recentEnquiriesRaw.map((e) => e.id);
  const countMap = new Map<number, number>();
  if (recentIds.length > 0) {
    const counts = await db
      .select({
        enquiryId: enquiryAttachmentsTable.enquiryId,
        cnt: sql<number>`cast(count(*) as integer)`,
      })
      .from(enquiryAttachmentsTable)
      .where(inArray(enquiryAttachmentsTable.enquiryId, recentIds))
      .groupBy(enquiryAttachmentsTable.enquiryId);
    for (const row of counts) countMap.set(row.enquiryId, row.cnt);
  }
  const recentEnquiries = recentEnquiriesRaw.map((e) => ({
    ...e,
    attachmentCount: countMap.get(e.id) ?? 0,
  }));

  const statusCounts = {
    new_enquiry: 0,
    reviewing: 0,
    survey_required: 0,
    quote_sent: 0,
    won: 0,
    lost: 0,
  } as Record<string, number>;

  for (const e of allEnquiries) {
    if (e.status in statusCounts) {
      statusCounts[e.status]++;
    }
  }

  const totalQuoteValue = quotes.reduce(
    (sum, q) => sum + Number(q.estimatedTotal ?? 0),
    0,
  );

  res.json(
    GetDashboardResponse.parse({
      totalEnquiries: allEnquiries.length,
      newEnquiries: statusCounts["new_enquiry"],
      reviewing: statusCounts["reviewing"],
      surveyRequired: statusCounts["survey_required"],
      quoteSent: statusCounts["quote_sent"],
      won: statusCounts["won"],
      lost: statusCounts["lost"],
      totalQuoteValue,
      recentEnquiries: recentEnquiries,
    }),
  );
});

export default router;
