import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, companiesTable } from "@workspace/db";
import { eq, desc, isNull } from "drizzle-orm";

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

  // ── Environment classification ─────────────────────────────────────────────
  const nodeEnv = process.env.NODE_ENV ?? "unknown";

  const clerkKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const clerkEnv = clerkKey.startsWith("pk_live_") ? "production" : "development";
  // Show only the first segment of the key (never the full key)
  const clerkKeyPrefix = clerkKey.slice(0, 14) + "…";

  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbEnv =
    dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")
      ? "development"
      : "production";

  // ── Company row ────────────────────────────────────────────────────────────
  let company: { id: number; name: string; widgetToken: string | null } | null = null;

  const [ownedCompany] = await db
    .select({ id: companiesTable.id, name: companiesTable.name, widgetToken: companiesTable.widgetToken })
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId!))
    .limit(1);

  if (ownedCompany) {
    company = ownedCompany;
  } else {
    // Single-tenant fallback: unowned company (first-login scenario)
    const [unowned] = await db
      .select({ id: companiesTable.id, name: companiesTable.name, widgetToken: companiesTable.widgetToken })
      .from(companiesTable)
      .where(isNull(companiesTable.ownerUserId))
      .limit(1);
    company = unowned ?? null;
  }

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
    clerkPublishableKeyPrefix: clerkKeyPrefix,
    dbEnvironment: dbEnv,
    userId,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    widgetToken: company?.widgetToken ?? null,
    latestEnquiryAt: latestEnquiry?.createdAt ?? null,
  });
});

export default router;
