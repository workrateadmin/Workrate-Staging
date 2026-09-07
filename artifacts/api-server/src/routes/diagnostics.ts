import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, enquiriesTable, companiesTable, pool } from "@workspace/db";
import { GetDiagnosticsResponse } from "@workspace/api-zod";
import { eq, desc } from "drizzle-orm";
import { isBillingAdmin } from "../services/billing/pricing";
import { canAccessOwnerDiagnostics } from "../services/diagnostics/authorization";
import { getRuntimeConfig } from "../lib/runtime-config";
import {
  canSendCustomerMessages,
  isProductionEnvironment,
} from "../lib/runtime-environment";
import { getStorageEnvironmentConfig } from "../lib/storage-environment";
import { getVerifiedStorageBucketBinding } from "../lib/storage-bucket-runtime";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function stripeMode(): "test" | "live" | "disabled" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return "disabled";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

async function getMigrationVersion(): Promise<string | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `SELECT "name" FROM "_migrations" ORDER BY "applied_at" DESC LIMIT 1`,
    );
    return rows[0]?.name ?? null;
  } catch {
    // A migration table may not exist yet; diagnostics must remain available.
    return null;
  } finally {
    client.release();
  }
}

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

  const runtimeConfig = getRuntimeConfig();
  const customerCommsEnabled = canSendCustomerMessages();
  const storageConfig = getStorageEnvironmentConfig();
  const storageBinding = storageConfig
    ? getVerifiedStorageBucketBinding()
    : null;

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

  res.json(GetDiagnosticsResponse.parse({
    environment: runtimeConfig.environment,
    buildId: runtimeConfig.buildId,
    migrationVersion: await getMigrationVersion(),
    stripeMode: stripeMode(),
    hmrcMode: configured("HMRC_SANDBOX_CLIENT_ID") &&
      configured("HMRC_SANDBOX_CLIENT_SECRET") &&
      configured("HMRC_OAUTH_REDIRECT_URL") &&
      configured("HMRC_TOKEN_ENCRYPTION_KEY")
      ? "sandbox"
      : "disabled",
    storageEnvironment: configured("DEFAULT_OBJECT_STORAGE_BUCKET_ID")
      ? runtimeConfig.environment
      : "unconfigured",
    storageObjectPathPrefix: storageConfig?.objectPathPrefix ?? null,
    storageBucketFingerprint: storageConfig?.bucketFingerprint ?? null,
    storageLegacyReadsAllowed: storageConfig?.legacyReadsAllowed ?? false,
    storageBindingVerified: storageBinding !== null,
    providers: {
      stripeEnabled: stripeMode() === "test" || stripeMode() === "live",
      hmrcEnabled: configured("HMRC_SANDBOX_CLIENT_ID") &&
        configured("HMRC_SANDBOX_CLIENT_SECRET") &&
        configured("HMRC_OAUTH_REDIRECT_URL") &&
        configured("HMRC_TOKEN_ENCRYPTION_KEY"),
      storageEnabled: storageConfig !== null,
      clerkEnabled: configured("CLERK_PUBLISHABLE_KEY"),
      aiEnabled: configured("OPENAI_API_KEY"),
      emailEnabled: configured("RESEND_API_KEY") &&
        (isProductionEnvironment(runtimeConfig.environment) ||
          (customerCommsEnabled &&
            configured("WORKRATE_NON_PRODUCTION_EMAIL_ALLOWLIST"))),
      vapiEnabled: configured("VAPI_PRIVATE_KEY") && customerCommsEnabled,
      whatsappEnabled: configured("WHATSAPP_APP_SECRET") &&
        configured("WHATSAPP_WEBHOOK_VERIFY_TOKEN") &&
        customerCommsEnabled,
    },
    apiOrigin: `${req.protocol}://${req.get("host")}`,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    latestEnquiryAt: latestEnquiry?.createdAt ?? null,
  }));
});

export default router;
