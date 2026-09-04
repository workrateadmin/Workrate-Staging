import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  GetEnquiryTimelineParams, GetEnquiryTimelineQueryParams, GetEnquiryTimelineResponse,
  GetJobTimelineParams, GetJobTimelineQueryParams, GetJobTimelineResponse,
} from "@workspace/api-zod";
import { findJobForOwnedEnquiry, findOwnedEnquiry, findOwnedJob, loadTimelinePageFromDatabase, type TimelineCategory } from "../lib/timeline";

const router: IRouter = Router();
const requireAuth = (req: any, res: any, next: any) => {
  if (!getAuth(req)?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};
const options = (data: any) => ({ limit: data.limit ?? 30, offset: data.offset ?? 0, order: data.order ?? "newest", category: data.category as TimelineCategory | undefined });

router.get("/enquiries/:id/timeline", requireAuth, async (req, res): Promise<void> => {
  const params = GetEnquiryTimelineParams.safeParse(req.params);
  const query = GetEnquiryTimelineQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const enquiry = await findOwnedEnquiry(params.data.id, getAuth(req).userId!);
  if (!enquiry) { res.status(404).json({ error: "Enquiry not found" }); return; }
  const ownedJob = await findJobForOwnedEnquiry(enquiry.id);
  const queryOptions = options(query.data);
  const page = await loadTimelinePageFromDatabase({ enquiryId: enquiry.id, jobId: ownedJob?.id ?? null, userId: getAuth(req).userId!, ...queryOptions });
  res.json(GetEnquiryTimelineResponse.parse(page));
});

router.get("/jobs/:id/timeline", requireAuth, async (req, res): Promise<void> => {
  const params = GetJobTimelineParams.safeParse(req.params);
  const query = GetJobTimelineQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const owned = await findOwnedJob(params.data.id, getAuth(req).userId!);
  if (!owned) { res.status(404).json({ error: "Job not found" }); return; }
  const queryOptions = options(query.data);
  const page = await loadTimelinePageFromDatabase({ enquiryId: owned.enquiry.id, jobId: owned.job.id, userId: getAuth(req).userId!, ...queryOptions });
  res.json(GetJobTimelineResponse.parse(page));
});

export default router;