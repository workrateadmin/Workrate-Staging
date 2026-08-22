import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, integrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../lib/integration-secret";

const router: IRouter = Router();
const VAPI_WEBHOOK_PATH = "/api/webhooks/vapi";

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};

// ── Integration provider registry ─────────────────────────────────────────────
export const INTEGRATION_PROVIDERS = [
  // ── Messaging ────────────────────────────────────────────────────────────
  {
    provider: "facebook_messenger",
    name: "Facebook Messenger",
    category: "messaging" as const,
    description:
      "Receive new enquiries directly from your Facebook Page inbox. Customers can message you on Messenger and their details flow straight into the WorkRate pipeline.",
  },
  {
    provider: "instagram",
    name: "Instagram",
    category: "messaging" as const,
    description:
      "Capture leads from Instagram DMs and story replies. Connect your Instagram Business account so every project enquiry lands in your pipeline automatically.",
  },
  {
    provider: "whatsapp_business",
    name: "WhatsApp Business",
    category: "messaging" as const,
    description:
      "Let customers message you on WhatsApp. The WorkRate Assistant handles the conversation and creates the enquiry — you only see qualified leads.",
  },
  // ── Email ─────────────────────────────────────────────────────────────────
  {
    provider: "email",
    name: "Email",
    category: "email" as const,
    description:
      "Send professional quotes and job summaries direct from WorkRate. Connect your business email (Gmail, Outlook, or custom SMTP) to email customers without leaving the platform.",
  },
  // ── Accounting ────────────────────────────────────────────────────────────
  {
    provider: "xero",
    name: "Xero",
    category: "accounting" as const,
    description:
      "Push accepted quotes to Xero as draft invoices with one click. Keep your books up to date automatically as jobs move through the pipeline.",
  },
  {
    provider: "quickbooks",
    name: "QuickBooks",
    category: "accounting" as const,
    description:
      "Sync won jobs to QuickBooks Online. Create invoices, track payments, and reconcile your accounts without double-entering data.",
  },
  // ── Payments ─────────────────────────────────────────────────────────────
  {
    provider: "stripe",
    name: "Stripe",
    category: "payments" as const,
    description:
      "Accept deposit and final payments directly from your quotes. Send customers a payment link and get notified the moment they pay.",
  },
] as const;

export type ProviderCategory = typeof INTEGRATION_PROVIDERS[number]["category"];

// ── GET /integrations ─────────────────────────────────────────────────────────
router.get("/integrations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  // Load DB records scoped to this user
  const rows = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.ownerUserId, userId!));
  const statusMap = new Map(rows.map((r) => [r.provider, r]));

  const integrations = INTEGRATION_PROVIDERS.map((p) => {
    const row = statusMap.get(p.provider);
    return {
      provider: p.provider,
      name: p.name,
      category: p.category,
      description: p.description,
      status: row?.status ?? "disconnected",
      metadata: row?.metadata ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
    };
  });

  res.json(integrations);
});

// ── GET /integrations/:provider ───────────────────────────────────────────────
router.get("/integrations/:provider", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const providerDef = INTEGRATION_PROVIDERS.find((p) => p.provider === req.params.provider);
  if (!providerDef) { res.status(404).json({ error: "Unknown provider" }); return; }

  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, req.params.provider),
    ));

  res.json({
    provider: providerDef.provider,
    name: providerDef.name,
    category: providerDef.category,
    description: providerDef.description,
    status: row?.status ?? "disconnected",
    metadata: row?.metadata ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
  });
});

// ── POST /integrations/whatsapp_business/connect ─────────────────────────────
// Saves a business's Meta WhatsApp Cloud API credentials.
// Body: { phoneNumberId, accessToken, displayNumber? }
// The global app secret is configured as WHATSAPP_APP_SECRET env var (not per-user).
router.post("/integrations/whatsapp_business/connect", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const { phoneNumberId, accessToken, displayNumber } = req.body as {
    phoneNumberId?: string;
    accessToken?: string;
    displayNumber?: string;
  };

  if (!phoneNumberId || !accessToken) {
    res.status(400).json({ error: "phoneNumberId and accessToken are required" });
    return;
  }

  const config   = JSON.stringify({ phoneNumberId, accessToken });
  const metadata = JSON.stringify({
    displayNumber:       displayNumber ?? null,
    phoneNumberId,
    greeting:            "Hi! I'm the WorkRate Assistant. I'll help collect your project details — what's your name?",
    outOfHoursMessage:   "Thanks for getting in touch! We're currently outside business hours but will respond as soon as possible.",
    aiEnabled:           true,
    humanHandoffEnabled: false,
  });

  // Upsert the integration row for this user
  const [existing] = await db
    .select({ id: integrationsTable.id })
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, "whatsapp_business"),
    ));

  if (existing) {
    await db
      .update(integrationsTable)
      .set({ config, metadata, status: "connected", connectedAt: new Date() })
      .where(eq(integrationsTable.id, existing.id));
  } else {
    await db.insert(integrationsTable).values({
      ownerUserId: userId!,
      provider:    "whatsapp_business",
      status:      "connected",
      config,
      metadata,
      connectedAt: new Date(),
    });
  }

  res.json({
    status:        "connected",
    phoneNumberId,
    displayNumber: displayNumber ?? null,
    webhookUrl:    `https://work-rate-manager.replit.app/api/webhooks/whatsapp`,
    message:       "WhatsApp Business connected. Register the webhook URL in your Meta App dashboard.",
  });
});

// ── PUT /integrations/whatsapp_business/settings ─────────────────────────────
// Updates per-business WhatsApp settings (greeting, hours, AI toggle, etc.)
// Body: { greeting?, outOfHoursMessage?, aiEnabled?, humanHandoffEnabled? }
router.put("/integrations/whatsapp_business/settings", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, "whatsapp_business"),
    ));

  if (!row) {
    res.status(404).json({ error: "WhatsApp Business not connected" });
    return;
  }

  const current = row.metadata ? JSON.parse(row.metadata) : {};
  const { greeting, outOfHoursMessage, aiEnabled, humanHandoffEnabled } = req.body as {
    greeting?: string;
    outOfHoursMessage?: string;
    aiEnabled?: boolean;
    humanHandoffEnabled?: boolean;
  };

  const updated = {
    ...current,
    ...(greeting            !== undefined && { greeting }),
    ...(outOfHoursMessage   !== undefined && { outOfHoursMessage }),
    ...(aiEnabled           !== undefined && { aiEnabled }),
    ...(humanHandoffEnabled !== undefined && { humanHandoffEnabled }),
  };

  await db
    .update(integrationsTable)
    .set({ metadata: JSON.stringify(updated) })
    .where(eq(integrationsTable.id, row.id));

  res.json({ success: true, settings: updated });
});

// ── Vapi phone integration ─────────────────────────────────────────────────────
// The secret is stored only in config. Metadata is deliberately safe to return
// to the browser so an owner can verify the mapping without ever re-reading it.
router.get("/integrations/vapi/settings", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, "vapi"),
    ))
    .limit(1);

  const metadata = row?.metadata ? JSON.parse(row.metadata) : {};
  res.json({
    connected: row?.status === "connected",
    assistantId: metadata.assistantId ?? null,
    phoneNumberId: metadata.phoneNumberId ?? null,
    phoneNumber: metadata.phoneNumber ?? null,
    enabled: metadata.enabled !== false,
    webhookPath: VAPI_WEBHOOK_PATH,
  });
});

router.post("/integrations/vapi/connect", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const body = req.body ?? {};
  const assistantId = typeof body.assistantId === "string" ? body.assistantId.trim() : "";
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  const webhookSecret = typeof body.webhookSecret === "string" ? body.webhookSecret : "";
  const enabled = body.enabled !== false;

  const [existing] = await db
    .select({ id: integrationsTable.id, config: integrationsTable.config })
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, "vapi"),
    ))
    .limit(1);
  const existingConfig = existing?.config ? JSON.parse(existing.config) : {};
  const secretToStore = webhookSecret || (
    typeof existingConfig.encryptedWebhookSecret === "string"
      ? decryptIntegrationSecret(existingConfig.encryptedWebhookSecret)
      : undefined
  );

  if ((!assistantId && !phoneNumberId && !phoneNumber) || typeof secretToStore !== "string" || secretToStore.length < 16) {
    res.status(400).json({
      error: "Provide a Vapi assistant ID or phone mapping and a webhook secret of at least 16 characters",
    });
    return;
  }

  const config = JSON.stringify({
    assistantId,
    phoneNumberId,
    phoneNumber,
    encryptedWebhookSecret: encryptIntegrationSecret(secretToStore),
    enabled,
  });
  const metadata = JSON.stringify({ assistantId: assistantId || null, phoneNumberId: phoneNumberId || null, phoneNumber: phoneNumber || null, enabled });

  if (existing) {
    await db
      .update(integrationsTable)
      .set({ config, metadata, status: "connected", connectedAt: new Date() })
      .where(eq(integrationsTable.id, existing.id));
  } else {
    await db.insert(integrationsTable).values({
      ownerUserId: userId!,
      provider: "vapi",
      status: "connected",
      config,
      metadata,
      connectedAt: new Date(),
    });
  }

  res.json({
    connected: true,
    assistantId: assistantId || null,
    phoneNumberId: phoneNumberId || null,
    phoneNumber: phoneNumber || null,
    enabled,
    webhookPath: VAPI_WEBHOOK_PATH,
  });
});

// ── POST /integrations/:provider/connect ─────────────────────────────────────
router.post("/integrations/:provider/connect", requireAuth, async (req, res): Promise<void> => {
  const providerDef = INTEGRATION_PROVIDERS.find((p) => p.provider === req.params.provider);
  if (!providerDef) { res.status(404).json({ error: "Unknown provider" }); return; }

  res.status(501).json({
    error: "not_implemented",
    message: `The ${providerDef.name} integration is coming soon.`,
  });
});

// ── DELETE /integrations/:provider ───────────────────────────────────────────
router.delete("/integrations/:provider", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, req.params.provider),
    ));

  if (!row) { res.status(404).json({ error: "Integration not connected" }); return; }

  await db
    .delete(integrationsTable)
    .where(and(
      eq(integrationsTable.ownerUserId, userId!),
      eq(integrationsTable.provider, req.params.provider),
    ));

  res.status(204).end();
});

export default router;
