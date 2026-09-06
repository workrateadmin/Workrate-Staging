import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, companiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { isBillingAdmin } from "../services/billing/pricing";
import { canAccessOwnerDiagnostics } from "../services/diagnostics/authorization";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

/**
 * GET /diagnostics
 * Returns live environment metadata for the authenticated user.
 * No secrets are exposed — key values are masked or derived.
 */
router.get("/diagnostics", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  const [ownedCompany] = await db
    .select({ id: companiesTable.id, name: companiesTable.name, ownerUserId: companiesTable.ownerUserId })
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  if (!canAccessOwnerDiagnostics({
    authenticatedUserId: userId,
    tenantOwnerUserId: ownedCompany?.ownerUserId,
    isPlatformAdmin: isBillingAdmin(userId),
  })) {
    res.status(403).json({ error: "Owner or administrator access is required." });
    return;
  }

  // ── Environment classification ─────────────────────────────────────────────
  const nodeEnv = process.env.NODE_ENV ?? "unknown";

  const clerkKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const clerkEnv = clerkKey.startsWith("pk_live_") ? "production" : "development";

  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbEnv =
    dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")
      ? "development"
      : "production";

  // ── Company row ────────────────────────────────────────────────────────────
  let company: { id: number; name: string } | null = null;

  company = ownedCompany ?? null;

  // ── Latest enquiry ─────────────────────────────────────────────────────────
  const [latestEnquiry] = await db
    .select({ createdAt: enquiriesTable.createdAt })
    .from(enquiriesTable)
    .where(eq(enquiriesTable.ownerUserId, userId!))
    .orderBy(desc(enquiriesTable.createdAt))
    .limit(1);

  res.json({
    environment: nodeEnv,
    apiOrigin: `${req.protocol}://${req.get("host")}`,
    clerkEnvironment: clerkEnv,
    dbEnvironment: dbEnv,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    latestEnquiryAt: latestEnquiry?.createdAt ?? null,
  });
});

export default router;
