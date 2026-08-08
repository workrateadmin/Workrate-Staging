import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, integrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

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
