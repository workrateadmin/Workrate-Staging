import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  companiesTable,
  db,
  financeAuditEventsTable,
  financeExpensesTable,
  financeIncomeRecordsTable,
  financeReceiptsTable,
  hmrcConnectionsTable,
  hmrcOauthStatesTable,
  hmrcQuarterlyPreparationsTable,
  hmrcSubmissionAttemptsTable,
} from "@workspace/db";
import {
  createAuthorizationUrl,
  createCodeChallenge,
  createOpaqueValue,
  decryptHmrcValue,
  encryptHmrcValue,
  exchangeAuthorizationCode,
  expiresAt,
  getHmrcSandboxConfig,
  getHmrcSandboxConfigStatus,
  grantedScope,
  refreshAccessToken,
  sha256,
  type HmrcBrowserContext,
  type HmrcSandboxConfig,
  type StoredFraudContext,
} from "../lib/hmrc";
import { canonicalObligationKey, prepareQuarterlyFigures, submissionStatusFromGateway } from "../lib/hmrc-quarterly-preparation";
import {
  createHmrcGatewayAttestationGrant,
  getHmrcGatewayStatus,
  readHmrcSandboxViaGateway,
  submitViaHmrcSandboxGateway,
  validateFraudHeadersViaGateway,
} from "../lib/hmrc-gateway";
import { claimHmrcOauthState } from "../lib/hmrc-oauth-state";
import { hmrcClientIp, requireHmrcSameOrigin } from "../lib/hmrc-security";
import { requireBillingFeature } from "../services/billing/authorization";
import { isBillingAdmin } from "../services/billing/pricing";

const router: IRouter = Router();
const HMRC_STATE_TTL_MS = 10 * 60 * 1000;
const NINO_PATTERN = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i;

const browserContextSchema = z.object({
  browserUserAgent: z.string().min(1).max(1024),
  deviceId: z.string().uuid(),
  timezone: z.string().regex(/^UTC[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/),
  screens: z.array(z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    colourDepth: z.number().int().positive(),
    scalingFactor: z.number().positive(),
  })).min(1),
  windowSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  clientPublicPort: z.number().int().positive().optional(),
  multiFactor: z.string().min(1).max(2048).optional(),
});

const connectSchema = z.object({
  taxpayerId: z.string().trim().toUpperCase().regex(NINO_PATTERN, "Use a valid sandbox NINO."),
  browserContext: browserContextSchema,
  returnPath: z.string().max(500).optional(),
});

const syncSchema = z.object({
  browserContext: browserContextSchema,
  attestation: z.string().min(40).max(16_384),
});
const preparationSchema = z.object({
  obligationKey: z.string().min(1).max(300),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.periodStart <= value.periodEnd, "Period start must be on or before period end.");
const submitSchema = z.object({
  declaration: z.literal(true, { error: "A human declaration is required before sandbox submission." }),
  idempotencyKey: z.string().uuid(),
  browserContext: browserContextSchema,
  attestation: z.string().min(40).max(16_384),
});
const gatewayActionSchema = z.object({
  browserContext: browserContextSchema,
  attestation: z.string().min(40).max(16_384),
});

type HmrcBusinesses = {
  listOfBusinesses?: Array<{
    typeOfBusiness?: string;
    businessId?: string;
    tradingType?: string;
    tradingName?: string;
  }>;
};

type HmrcObligations = {
  obligations?: Array<{
    typeOfBusiness?: string;
    businessId?: string;
    obligationDetails?: Array<{
      periodStartDate?: string;
      periodEndDate?: string;
      dueDate?: string;
      status?: string;
      receivedDate?: string;
    }>;
  }>;
};
type CachedObligation = {
  businessId: string; businessType: string; periodStartDate: string; periodEndDate: string; dueDate?: string; status?: string;
};
function cachedObligation(connection: typeof hmrcConnectionsTable.$inferSelect | null, key: string): CachedObligation | null {
  for (const group of (connection?.obligations as HmrcObligations | null)?.obligations ?? []) {
    for (const detail of group.obligationDetails ?? []) {
      if (group.businessId && group.typeOfBusiness && detail.periodStartDate && detail.periodEndDate) {
        const value: CachedObligation = {
          businessId: group.businessId, businessType: group.typeOfBusiness,
          periodStartDate: detail.periodStartDate, periodEndDate: detail.periodEndDate,
          dueDate: detail.dueDate, status: detail.status,
        };
        if (canonicalObligationKey(value) === key) return value;
      }
    }
  }
  return null;
}

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

async function businessFor(userId: string) {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, userId))
    .limit(1);
  return company ?? null;
}

function safeReturnPath(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return "/finance";
}

function hmrcTaxYearFor(date: string): string {
  const year = Number(date.slice(0, 4));
  const startsThisYear = date >= `${year}-04-06`;
  const start = startsThisYear ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function callbackRedirect(config: HmrcSandboxConfig, returnPath: string, result: string): string {
  const origin = new URL(config.redirectUrl).origin;
  const url = new URL(safeReturnPath(returnPath), origin);
  url.searchParams.set("hmrc", result);
  return url.toString();
}

function safeError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("HMRC")) return error.message;
  return "HMRC sandbox connection needs attention. Check the connection settings and try again.";
}

function safeCallbackFailure(error: unknown): string {
  if (
    error instanceof Error &&
    (error.message.startsWith("HMRC token exchange") || error.message.startsWith("HMRC sandbox configuration"))
  ) {
    return error.message;
  }
  return "OAuth callback failed before encrypted connection storage.";
}

function storedFraudContext(req: any, browserContext: HmrcBrowserContext): StoredFraudContext {
  return {
    ...browserContext,
    clientPublicIp: hmrcClientIp(req),
    capturedAt: new Date().toISOString(),
  };
}

async function writeAudit(input: {
  companyId: number;
  ownerUserId: string;
  entityId: number;
  action: string;
  afterData?: unknown;
}) {
  await db.insert(financeAuditEventsTable).values({
    companyId: input.companyId,
    ownerUserId: input.ownerUserId,
    entityType: "hmrc_connection",
    entityId: input.entityId,
    action: input.action,
    actorUserId: input.ownerUserId,
    afterData: input.afterData ?? null,
  });
}

function connectionStatus(connection: typeof hmrcConnectionsTable.$inferSelect | null) {
  const configuration = getHmrcSandboxConfigStatus();
  if (!connection) {
    return {
      status: "not_connected",
      sandboxConfigured: configuration.configured,
      configurationMessage: configuration.message,
      scopes: [],
      connectedAt: null,
      disconnectedAt: null,
      lastSuccessfulSyncAt: null,
      lastError: null,
      businesses: [],
      obligations: [],
    };
  }
  const businesses = (connection.businessDetails as HmrcBusinesses | null)?.listOfBusinesses ?? [];
  const obligations = (connection.obligations as HmrcObligations | null)?.obligations ?? [];
  return {
    status: connection.status,
    sandboxConfigured: configuration.configured,
    configurationMessage: configuration.message,
    scopes: connection.scopes.split(/\s+/).filter(Boolean),
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastError: connection.lastError,
    businesses,
    obligations,
  };
}

async function storedConnection(companyId: number, ownerUserId: string) {
  const [connection] = await db
    .select()
    .from(hmrcConnectionsTable)
    .where(and(
      eq(hmrcConnectionsTable.companyId, companyId),
      eq(hmrcConnectionsTable.ownerUserId, ownerUserId),
    ))
    .limit(1);
  return connection ?? null;
}

async function accessTokenFor(
  connection: typeof hmrcConnectionsTable.$inferSelect,
  config: HmrcSandboxConfig,
): Promise<{ accessToken: string; connection: typeof hmrcConnectionsTable.$inferSelect }> {
  if (!connection.encryptedAccessToken || !connection.encryptedTaxpayerId) {
    throw new Error("HMRC connection credentials are unavailable. Reconnect the sandbox account.");
  }
  const expiresSoon = !connection.accessTokenExpiresAt ||
    connection.accessTokenExpiresAt.getTime() <= Date.now() + 60_000;
  if (!expiresSoon) {
    return {
      accessToken: decryptHmrcValue(connection.encryptedAccessToken, config, `connection:${connection.companyId}:access-token`),
      connection,
    };
  }
  if (!connection.encryptedRefreshToken) {
    throw new Error("HMRC access has expired. Reconnect the sandbox account.");
  }

  const refreshToken = decryptHmrcValue(
    connection.encryptedRefreshToken,
    config,
    `connection:${connection.companyId}:refresh-token`,
  );
  let tokens;
  try {
    tokens = await refreshAccessToken(config, refreshToken);
  } catch {
    await db.update(hmrcConnectionsTable).set({
      status: "reconnect_required",
      lastError: "HMRC access could not be refreshed. Reconnect the sandbox account.",
    }).where(eq(hmrcConnectionsTable.id, connection.id));
    throw new Error("HMRC access could not be refreshed. Reconnect the sandbox account.");
  }
  const [updated] = await db.update(hmrcConnectionsTable).set({
    encryptedAccessToken: encryptHmrcValue(
      tokens.access_token!,
      config,
      `connection:${connection.companyId}:access-token`,
    ),
    encryptedRefreshToken: tokens.refresh_token
      ? encryptHmrcValue(tokens.refresh_token, config, `connection:${connection.companyId}:refresh-token`)
      : connection.encryptedRefreshToken,
    accessTokenExpiresAt: expiresAt(tokens.expires_in),
    scopes: grantedScope(tokens.scope ?? connection.scopes),
    status: "connected",
    lastError: null,
  }).where(and(
    eq(hmrcConnectionsTable.id, connection.id),
    eq(hmrcConnectionsTable.companyId, connection.companyId),
    eq(hmrcConnectionsTable.ownerUserId, connection.ownerUserId),
  )).returning();
  await writeAudit({
    companyId: updated.companyId,
    ownerUserId: updated.ownerUserId,
    entityId: updated.id,
    action: "token_refreshed",
    afterData: { status: updated.status },
  });
  return {
    accessToken: tokens.access_token!,
    connection: updated,
  };
}

async function synchronise(
  connection: typeof hmrcConnectionsTable.$inferSelect,
  config: HmrcSandboxConfig,
  input: { userId: string; companyId: number; sessionId: string; browserContext: HmrcBrowserContext; attestation: string },
): Promise<typeof hmrcConnectionsTable.$inferSelect> {
  const token = await accessTokenFor(connection, config);
  const taxpayerId = decryptHmrcValue(
    token.connection.encryptedTaxpayerId!,
    config,
    `connection:${token.connection.companyId}:taxpayer-id`,
  );
  const [businesses, obligations] = await Promise.all([
    readHmrcSandboxViaGateway<HmrcBusinesses>({
      ...input, operation: "business-details", accessToken: token.accessToken, taxpayerId,
    }),
    readHmrcSandboxViaGateway<HmrcObligations>({
      ...input, operation: "obligations", accessToken: token.accessToken, taxpayerId,
    }),
  ]);
  const [updated] = await db.update(hmrcConnectionsTable).set({
    status: "connected",
    businessDetails: businesses,
    obligations,
    lastSuccessfulSyncAt: new Date(),
    lastError: null,
  }).where(and(
    eq(hmrcConnectionsTable.id, token.connection.id),
    eq(hmrcConnectionsTable.companyId, token.connection.companyId),
    eq(hmrcConnectionsTable.ownerUserId, token.connection.ownerUserId),
  )).returning();
  await writeAudit({
    companyId: updated.companyId,
    ownerUserId: updated.ownerUserId,
    entityId: updated.id,
    action: "obligations_fetched",
    afterData: {
      businessCount: businesses.listOfBusinesses?.length ?? 0,
      obligationGroupCount: obligations.obligations?.length ?? 0,
    },
  });
  return updated;
}

router.get("/finance/hmrc/status", requireAuth, requireBillingFeature("advanced_finance_mtd"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const { userId } = auth;
  const company = await businessFor(userId!);
  if (!company) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }
  res.json(connectionStatus(await storedConnection(company.id, userId!)));
});

router.post("/finance/hmrc/connect", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid HMRC connection request." });
    return;
  }
  const auth = getAuth(req);
  const { userId } = auth;
  const company = await businessFor(userId!);
  if (!company) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  let config: HmrcSandboxConfig;
  try {
    config = getHmrcSandboxConfig();
  } catch (error) {
    res.status(503).json({ error: safeError(error) });
    return;
  }

  const state = createOpaqueValue();
  const verifier = createOpaqueValue();
  const returnPath = safeReturnPath(parsed.data.returnPath);
  await db.delete(hmrcOauthStatesTable).where(and(
    eq(hmrcOauthStatesTable.companyId, company.id),
    eq(hmrcOauthStatesTable.ownerUserId, userId!),
  ));
  await db.insert(hmrcOauthStatesTable).values({
    companyId: company.id,
    ownerUserId: userId!,
    stateHash: sha256(state),
    encryptedCodeVerifier: encryptHmrcValue(verifier, config, `oauth:${company.id}:verifier`),
    encryptedTaxpayerId: encryptHmrcValue(parsed.data.taxpayerId, config, `oauth:${company.id}:taxpayer-id`),
    fraudContext: storedFraudContext(req, parsed.data.browserContext),
    returnPath,
    expiresAt: new Date(Date.now() + HMRC_STATE_TTL_MS),
  });
  req.log.info({ companyId: company.id }, "HMRC sandbox authorisation started");
  res.json({
    authorizationUrl: createAuthorizationUrl(config, {
      state,
      codeChallenge: createCodeChallenge(verifier),
    }),
    expiresAt: new Date(Date.now() + HMRC_STATE_TTL_MS).toISOString(),
  });
});

router.get("/hmrc/callback", requireAuth, async (req, res): Promise<void> => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!state || !code) {
    res.status(400).send("HMRC sandbox authorisation did not return the expected callback values.");
    return;
  }

  let config: HmrcSandboxConfig;
  try {
    config = getHmrcSandboxConfig();
  } catch {
    res.status(503).send("HMRC sandbox configuration is incomplete.");
    return;
  }

  const stateHash = createHash("sha256").update(state).digest("hex");
  const [oauthState] = await db.select().from(hmrcOauthStatesTable).where(
    eq(hmrcOauthStatesTable.stateHash, stateHash),
  ).limit(1);
  if (!oauthState) {
    res.status(400).send("This HMRC sandbox authorisation has expired or has already been used.");
    return;
  }

  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company || company.id !== oauthState.companyId || userId !== oauthState.ownerUserId) {
    res.status(403).send("This HMRC sandbox authorisation belongs to a different WorkRate business.");
    return;
  }

  // Atomically claim the state before the external token exchange. Concurrent
  // callbacks can no longer both use the same state, and failed exchanges stay
  // consumed rather than becoming replayable until their TTL expires.
  const claimedState = await claimHmrcOauthState({
    id: oauthState.id,
    stateHash,
    companyId: company.id,
    ownerUserId: userId!,
  });
  if (!claimedState) {
    res.status(400).send("This HMRC sandbox authorisation has expired or has already been used.");
    return;
  }

  try {
    const verifier = decryptHmrcValue(claimedState.encryptedCodeVerifier, config, `oauth:${company.id}:verifier`);
    const taxpayerId = decryptHmrcValue(claimedState.encryptedTaxpayerId, config, `oauth:${company.id}:taxpayer-id`);
    const tokens = await exchangeAuthorizationCode(config, code, verifier);
    const existing = await storedConnection(company.id, userId!);
    const values = {
      status: "connected",
      encryptedAccessToken: encryptHmrcValue(tokens.access_token!, config, `connection:${company.id}:access-token`),
      encryptedRefreshToken: tokens.refresh_token
        ? encryptHmrcValue(tokens.refresh_token, config, `connection:${company.id}:refresh-token`)
        : existing?.encryptedRefreshToken ?? null,
      accessTokenExpiresAt: expiresAt(tokens.expires_in),
      scopes: grantedScope(tokens.scope),
      encryptedTaxpayerId: encryptHmrcValue(taxpayerId, config, `connection:${company.id}:taxpayer-id`),
      connectedAt: new Date(),
      disconnectedAt: null,
      lastError: null,
    };
    const [connection] = existing
      ? await db.update(hmrcConnectionsTable).set(values).where(and(
          eq(hmrcConnectionsTable.id, existing.id),
          eq(hmrcConnectionsTable.companyId, company.id),
          eq(hmrcConnectionsTable.ownerUserId, userId!),
        )).returning()
      : await db.insert(hmrcConnectionsTable).values({
          companyId: company.id,
          ownerUserId: userId!,
          ...values,
        }).returning();

    await writeAudit({
      companyId: company.id,
      ownerUserId: userId!,
      entityId: connection.id,
      action: "connection_created",
      afterData: { status: connection.status, scopes: connection.scopes.split(/\s+/) },
    });

    // OAuth validation is intentionally separate from HMRC data retrieval.
    // The connection is usable after encrypted token storage, while the
    // explicit sync endpoint remains fail-closed on fraud-prevention evidence.
    await db.delete(hmrcOauthStatesTable).where(eq(hmrcOauthStatesTable.id, claimedState.id));
    res.redirect(callbackRedirect(config, claimedState.returnPath, "connected"));
  } catch (error) {
    req.log.warn({ companyId: company.id, failure: safeCallbackFailure(error) }, "HMRC sandbox callback failed");
    await db.delete(hmrcOauthStatesTable).where(eq(hmrcOauthStatesTable.id, claimedState.id));
    res.redirect(callbackRedirect(config, claimedState.returnPath, "error"));
  }
});

router.post("/finance/hmrc/sync", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid HMRC sync request." });
    return;
  }
  const auth = getAuth(req);
  const { userId } = auth;
  const company = await businessFor(userId!);
  if (!company) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }
  const connection = await storedConnection(company.id, userId!);
  if (!connection) {
    res.status(404).json({ error: "HMRC sandbox is not connected for this business." });
    return;
  }
  try {
    if (!auth.sessionId) { res.status(401).json({ error: "An active authenticated session is required." }); return; }
    const config = getHmrcSandboxConfig();
    const synced = await synchronise(connection, config, {
      userId: userId!, companyId: company.id, sessionId: auth.sessionId,
      browserContext: parsed.data.browserContext, attestation: parsed.data.attestation,
    });
    res.json(connectionStatus(synced));
  } catch (error) {
    const message = safeError(error);
    await db.update(hmrcConnectionsTable).set({ lastError: message }).where(and(
      eq(hmrcConnectionsTable.id, connection.id),
      eq(hmrcConnectionsTable.companyId, company.id),
      eq(hmrcConnectionsTable.ownerUserId, userId!),
    ));
    await writeAudit({
      companyId: company.id,
      ownerUserId: userId!,
      entityId: connection.id,
      action: "sync_error",
      afterData: { message },
    });
    req.log.warn({ companyId: company.id }, "HMRC sandbox sync failed");
    res.status(422).json({ error: message });
  }
});

// Income Tax MTD preparation only: it is intentionally separate from VAT and
// corporation tax. The cached HMRC obligation is the authoritative period list.
router.post("/finance/hmrc/preparations", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const parsed = preparationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid quarterly period." }); return; }
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const connection = await storedConnection(company.id, userId!);
  const obligation = cachedObligation(connection, parsed.data.obligationKey);
  if (!obligation || obligation.periodStartDate !== parsed.data.periodStart || obligation.periodEndDate !== parsed.data.periodEnd || obligation.status?.toLowerCase() === "fulfilled") {
    res.status(409).json({ error: "This outstanding HMRC obligation is not available for preparation." }); return;
  }
  const [expenses, income, receipts] = await Promise.all([
    db.select().from(financeExpensesTable).where(and(eq(financeExpensesTable.companyId, company.id), eq(financeExpensesTable.ownerUserId, userId!))),
    db.select().from(financeIncomeRecordsTable).where(and(eq(financeIncomeRecordsTable.companyId, company.id), eq(financeIncomeRecordsTable.ownerUserId, userId!))),
    db.select({ expenseId: financeReceiptsTable.expenseId }).from(financeReceiptsTable).where(and(eq(financeReceiptsTable.companyId, company.id), eq(financeReceiptsTable.ownerUserId, userId!))),
  ]);
  const prepared = prepareQuarterlyFigures({
    ...parsed.data,
    expenses,
    income,
    receiptExpenseIds: new Set(receipts.map((receipt) => receipt.expenseId)),
  });
  const existing = await db.select().from(hmrcQuarterlyPreparationsTable).where(and(
    eq(hmrcQuarterlyPreparationsTable.companyId, company.id),
    eq(hmrcQuarterlyPreparationsTable.obligationKey, parsed.data.obligationKey),
  )).limit(1);
  const values = { periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd, businessId: obligation.businessId, businessType: obligation.businessType, dueDate: obligation.dueDate ?? null, obligationStatus: obligation.status ?? "outstanding", figures: prepared.figures, payloadHash: prepared.payloadHash, status: "prepared", declarationText: null, reviewedByUserId: null, reviewedAt: null };
  const [record] = existing[0]
    ? await db.update(hmrcQuarterlyPreparationsTable).set(values).where(eq(hmrcQuarterlyPreparationsTable.id, existing[0].id)).returning()
    : await db.insert(hmrcQuarterlyPreparationsTable).values({ companyId: company.id, ownerUserId: userId!, obligationKey: parsed.data.obligationKey, ...values }).returning();
  await writeAudit({ companyId: company.id, ownerUserId: userId!, entityId: record.id, action: "quarterly_prepared", afterData: { obligationKey: record.obligationKey, payloadHash: record.payloadHash } });
  res.status(201).json({ ...record, notice: "MTD preparation only. Production filing is not enabled." });
});

router.get("/finance/hmrc/preparations", requireAuth, requireBillingFeature("advanced_finance_mtd"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  res.json(await db.select().from(hmrcQuarterlyPreparationsTable).where(and(eq(hmrcQuarterlyPreparationsTable.companyId, company.id), eq(hmrcQuarterlyPreparationsTable.ownerUserId, userId!))));
});

router.get("/finance/hmrc/submissions", requireAuth, requireBillingFeature("advanced_finance_mtd"), async (req, res): Promise<void> => {
  const { userId } = getAuth(req); const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const submissions = await db.select().from(hmrcSubmissionAttemptsTable).where(and(eq(hmrcSubmissionAttemptsTable.companyId, company.id), eq(hmrcSubmissionAttemptsTable.ownerUserId, userId!)));
  res.json(submissions);
});

router.post("/finance/hmrc/attestation-grant", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const company = await businessFor(auth.userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!auth.sessionId) { res.status(401).json({ error: "An active authenticated session is required." }); return; }
  try {
    res.json(createHmrcGatewayAttestationGrant({ userId: auth.userId!, companyId: company.id, sessionId: auth.sessionId }));
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "HMRC sandbox gateway is unavailable." });
  }
});

router.get("/finance/hmrc/gateway-status", requireAuth, requireBillingFeature("advanced_finance_mtd"), async (req, res): Promise<void> => {
  if (!isBillingAdmin(getAuth(req).userId)) { res.status(403).json({ error: "Administrator access is required." }); return; }
  res.json(await getHmrcGatewayStatus());
});

router.post("/finance/hmrc/preparations/:id/submit", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const parsed = submitSchema.safeParse(req.body);
  const preparationId = Number(req.params.id);
  if (!parsed.success || !Number.isInteger(preparationId)) { res.status(400).json({ error: parsed.success ? "Invalid preparation id." : parsed.error.issues[0]?.message }); return; }
  const { userId } = getAuth(req); const company = await businessFor(userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  const [preparation] = await db.select().from(hmrcQuarterlyPreparationsTable).where(and(eq(hmrcQuarterlyPreparationsTable.id, preparationId), eq(hmrcQuarterlyPreparationsTable.companyId, company.id), eq(hmrcQuarterlyPreparationsTable.ownerUserId, userId!))).limit(1);
  if (!preparation) { res.status(404).json({ error: "Quarterly preparation not found" }); return; }
  const [prior] = await db.select().from(hmrcSubmissionAttemptsTable).where(and(eq(hmrcSubmissionAttemptsTable.companyId, company.id), eq(hmrcSubmissionAttemptsTable.idempotencyKey, parsed.data.idempotencyKey))).limit(1);
  if (prior) { if (prior.preparationId !== preparation.id || prior.payloadHash !== preparation.payloadHash) { res.status(409).json({ error: "Idempotency key belongs to another preparation or payload." }); return; } res.json(prior); return; }
  const connection = await storedConnection(company.id, userId!);
  const obligation = cachedObligation(connection, preparation.obligationKey);
  if (!connection || !obligation || obligation.status?.toLowerCase() === "fulfilled" || obligation.businessId !== preparation.businessId || obligation.businessType !== preparation.businessType) {
    res.status(409).json({ error: "The current HMRC obligation is no longer outstanding for this preparation." }); return;
  }
  const figures = preparation.figures as { readyForSubmission?: boolean };
  if (!figures.readyForSubmission) { res.status(422).json({ error: "Unreviewed, unsupported, uncategorised, or potentially duplicate expenses must be resolved before submission." }); return; }
  const auth = getAuth(req);
  if (!auth.sessionId) { res.status(401).json({ error: "An active authenticated session is required." }); return; }
  const hmrcConfig = getHmrcSandboxConfig();
  const token = await accessTokenFor(connection, hmrcConfig);
  const taxpayerId = decryptHmrcValue(
    token.connection.encryptedTaxpayerId!,
    hmrcConfig,
    `connection:${token.connection.companyId}:taxpayer-id`,
  );
  const quarterlyPayload = {
    periodDates: {
      periodStartDate: preparation.periodStart,
      periodEndDate: preparation.periodEnd,
    },
    periodIncome: {
      turnover: (preparation.figures as any).incomeTotal,
      other: 0,
    },
    periodExpenses: {
      consolidatedExpenses: (preparation.figures as any).expenseTotal,
    },
  };
  const gatewayResult = await submitViaHmrcSandboxGateway({
    userId: userId!, companyId: company.id, sessionId: auth.sessionId,
    idempotencyKey: parsed.data.idempotencyKey, payloadHash: preparation.payloadHash,
    accessToken: token.accessToken, taxpayerId, businessId: preparation.businessId,
    taxYear: hmrcTaxYearFor(preparation.periodEnd), periodStart: preparation.periodStart,
    periodEnd: preparation.periodEnd, quarterlyPayload,
    attestation: parsed.data.attestation, browserContext: parsed.data.browserContext,
  });
  const outcome = submissionStatusFromGateway(gatewayResult);
  const [attempt] = await db.insert(hmrcSubmissionAttemptsTable).values({
    companyId: company.id, ownerUserId: userId!, preparationId: preparation.id,
    idempotencyKey: parsed.data.idempotencyKey, payloadHash: preparation.payloadHash,
    status: outcome.status, hmrcReference: outcome.reference, safeResponse: outcome.safeResponse,
    safeError: outcome.safeError, completedAt: new Date(),
  }).returning();
  await db.update(hmrcQuarterlyPreparationsTable).set({
    declarationText: "I confirm these figures are complete and correct for this HMRC sandbox quarterly update.",
    reviewedByUserId: userId!, reviewedAt: new Date(),
    ...(outcome.status === "submitted" ? { status: "submitted" } : {}),
  }).where(and(
    eq(hmrcQuarterlyPreparationsTable.id, preparation.id),
    eq(hmrcQuarterlyPreparationsTable.companyId, company.id),
    eq(hmrcQuarterlyPreparationsTable.ownerUserId, userId!),
  ));
  await writeAudit({ companyId: company.id, ownerUserId: userId!, entityId: preparation.id, action: "human_declaration_recorded", afterData: { preparationId: preparation.id } });
  await writeAudit({ companyId: company.id, ownerUserId: userId!, entityId: attempt.id, action: outcome.status === "submitted" ? "sandbox_submission_confirmed" : "sandbox_submission_not_confirmed", afterData: { preparationId: preparation.id, status: attempt.status, reference: attempt.hmrcReference } });
  res.status(outcome.status === "submitted" ? 200 : 503).json({ ...attempt, ...(attempt.safeError ? { error: attempt.safeError } : {}) });
});

router.post("/finance/hmrc/fraud-header-validation", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const parsed = gatewayActionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid gateway validation request." }); return; }
  const auth = getAuth(req);
  const company = await businessFor(auth.userId!);
  if (!company) { res.status(404).json({ error: "Business profile not found" }); return; }
  if (!auth.sessionId) { res.status(401).json({ error: "An active authenticated session is required." }); return; }
  const result = await validateFraudHeadersViaGateway({
    userId: auth.userId!, companyId: company.id, sessionId: auth.sessionId,
    attestation: parsed.data.attestation, browserContext: parsed.data.browserContext,
  });
  res.status(result.confirmed ? 200 : 503).json({
    status: result.status ?? "unavailable",
    message: result.safeError ?? null,
    checkedAt: result.checkedAt ?? null,
    issues: result.issues ?? [],
  });
});

router.delete("/finance/hmrc", requireAuth, requireBillingFeature("advanced_finance_mtd"), requireHmrcSameOrigin, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const company = await businessFor(userId!);
  if (!company) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }
  const connection = await storedConnection(company.id, userId!);
  if (!connection) {
    res.status(404).json({ error: "HMRC sandbox is not connected for this business." });
    return;
  }
  await db.delete(hmrcConnectionsTable).where(and(
    eq(hmrcConnectionsTable.id, connection.id),
    eq(hmrcConnectionsTable.companyId, company.id),
    eq(hmrcConnectionsTable.ownerUserId, userId!),
  ));
  await db.delete(hmrcOauthStatesTable).where(and(
    eq(hmrcOauthStatesTable.companyId, company.id),
    eq(hmrcOauthStatesTable.ownerUserId, userId!),
  ));
  await writeAudit({
    companyId: company.id,
    ownerUserId: userId!,
    entityId: connection.id,
    action: "disconnected",
    afterData: { status: "disconnected" },
  });
  req.log.info({ companyId: company.id }, "HMRC sandbox disconnected");
  res.status(204).end();
});

export default router;