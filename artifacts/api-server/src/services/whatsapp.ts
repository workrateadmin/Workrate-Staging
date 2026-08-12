/**
 * WhatsApp Business Cloud API helpers.
 *
 * All Meta API calls go through this service. No credentials are ever logged
 * or returned to API callers — they live only in the integrations.config column.
 *
 * Reusable for future channels: the general pattern (findBusiness, sendMessage,
 * downloadMedia) works identically for Instagram DMs and Facebook Messenger
 * once those webhook adapters are built.
 */
import crypto from "node:crypto";
import { db, integrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Sensitive credentials — stored encrypted in integrations.config */
export interface WAConfig {
  phoneNumberId: string;
  accessToken: string;
}

/** Non-sensitive settings — stored in integrations.metadata */
export interface WASettings {
  displayNumber?: string;
  phoneNumberId?: string;
  greeting?: string;
  outOfHoursMessage?: string;
  aiEnabled?: boolean;
  humanHandoffEnabled?: boolean;
}

export interface WABusiness {
  ownerUserId: string;
  integrationId: number;
  config: WAConfig;
  settings: WASettings;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const META_API = "https://graph.facebook.com/v21.0";

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify the x-hub-signature-256 header sent by Meta.
 * Uses timing-safe comparison to prevent timing oracle attacks.
 */
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: Buffer,
  signatureHeader: string,
): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

// ── Business lookup ───────────────────────────────────────────────────────────

/**
 * Find the WorkRate business that owns the incoming WhatsApp phone number ID.
 * Scans all connected whatsapp_business integrations — O(n) where n is connected
 * businesses, which will be very small in practice.
 */
export async function findBusinessByPhoneNumberId(
  phoneNumberId: string,
): Promise<WABusiness | null> {
  const rows = await db
    .select()
    .from(integrationsTable)
    .where(
      and(
        eq(integrationsTable.provider, "whatsapp_business"),
        eq(integrationsTable.status, "connected"),
      ),
    );

  for (const row of rows) {
    if (!row.config || !row.ownerUserId) continue;
    try {
      const cfg = JSON.parse(row.config) as WAConfig;
      if (cfg.phoneNumberId === phoneNumberId) {
        const meta: WASettings = row.metadata ? JSON.parse(row.metadata) : {};
        return {
          ownerUserId: row.ownerUserId,
          integrationId: row.id,
          config: cfg,
          settings: meta,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ── Messaging ─────────────────────────────────────────────────────────────────

/**
 * Send a plain-text message to a WhatsApp number via Meta Cloud API.
 * @param to  Customer phone in E.164 format without '+' (e.g. "447911123456")
 */
export async function sendTextMessage(
  config: WAConfig,
  to: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${META_API}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send failed (HTTP ${res.status}): ${body}`);
  }
}

// ── Media download ────────────────────────────────────────────────────────────

/**
 * Download a media file from Meta's CDN.
 *
 * Meta's two-step process:
 *   1. GET /{mediaId} → { url, mime_type }
 *   2. GET {url}      → binary bytes
 *
 * The access token is required for both requests.
 */
export async function downloadMedia(
  config: WAConfig,
  mediaId: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  // Step 1: resolve the download URL
  const metaRes = await fetch(`${META_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Failed to get media URL for ${mediaId}: ${await metaRes.text()}`);
  }
  const { url, mime_type } = (await metaRes.json()) as { url: string; mime_type?: string };

  // Step 2: download the actual bytes
  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download media ${mediaId}: HTTP ${fileRes.status}`);
  }

  const contentType = mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, contentType };
}
