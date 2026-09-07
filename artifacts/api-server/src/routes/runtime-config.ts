import { Router, type IRouter } from "express";
import { GetRuntimeConfigResponse } from "@workspace/api-zod";
import { getRuntimeConfig } from "../lib/runtime-config";

const router: IRouter = Router();

router.get("/runtime-config", (_req, res): void => {
  res.set("Cache-Control", "no-store");
  res.json(GetRuntimeConfigResponse.parse(getRuntimeConfig()));
});

export default router;