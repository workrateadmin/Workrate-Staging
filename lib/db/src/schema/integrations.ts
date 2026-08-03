import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores the connection state for each third-party integration provider.
 *
 * When an integration is first discovered (via the GET /integrations endpoint)
 * a row is NOT automatically inserted — rows only exist when a connection has
 * been attempted. The backend merges the registry list with DB rows at query
 * time so the full catalog is always visible.
 *
 * config   — provider-specific credentials / settings as a JSON string.
 *             Treat as sensitive; encrypt at rest in production.
 * metadata — non-sensitive display info (e.g. connected account name, org ID)
 *             as a JSON string, safe to return in API responses.
 */
export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(), // e.g. "stripe", "xero"
  status: text("status").notNull().default("disconnected"), // connected | disconnected | error
  config: text("config"),    // JSON — keep encrypted in production
  metadata: text("metadata"), // JSON — safe for API responses
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Integration = typeof integrationsTable.$inferSelect;
