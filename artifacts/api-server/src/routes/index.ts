import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companyRouter from "./company";
import enquiriesRouter from "./enquiries";
import attachmentsRouter from "./attachments";
import quotesRouter from "./quotes";
import dashboardRouter from "./dashboard";
import chatRouter from "./chat";
import integrationsRouter from "./integrations";
import jobsRouter from "./jobs";
import aiReceptionistRouter from "./ai-receptionist";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companyRouter);
router.use(enquiriesRouter);
router.use(attachmentsRouter);
router.use(quotesRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(integrationsRouter);
router.use(jobsRouter);
router.use(aiReceptionistRouter);

export default router;
