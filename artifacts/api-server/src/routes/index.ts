import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companyRouter from "./company";
import enquiriesRouter from "./enquiries";
import quotesRouter from "./quotes";
import dashboardRouter from "./dashboard";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companyRouter);
router.use(enquiriesRouter);
router.use(quotesRouter);
router.use(dashboardRouter);
router.use(chatRouter);

export default router;
