export const WIDGET_HEARTBEAT_RECENT_MS = 15 * 60 * 1000;

export function safeWidgetSiteOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function isRecentWidgetHeartbeat(
  lastSeenAt: string | null,
  now = Date.now(),
): boolean {
  const seenAtMs = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
  return Number.isFinite(seenAtMs) && now - seenAtMs <= WIDGET_HEARTBEAT_RECENT_MS;
}