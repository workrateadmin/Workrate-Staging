import { and, eq, gt, isNull } from "drizzle-orm";
import { db, hmrcOauthStatesTable } from "@workspace/db";

export type HmrcOauthStateClaimInput = {
  id: number;
  stateHash: string;
  companyId: number;
  ownerUserId: string;
};

/**
 * Atomically consumes an OAuth state before an HMRC token exchange begins.
 * A null result means another callback has already consumed it or it expired.
 */
export async function claimHmrcOauthState(input: HmrcOauthStateClaimInput) {
  const [claimedState] = await db.update(hmrcOauthStatesTable).set({ usedAt: new Date() })
    .where(and(
      eq(hmrcOauthStatesTable.id, input.id),
      eq(hmrcOauthStatesTable.stateHash, input.stateHash),
      eq(hmrcOauthStatesTable.companyId, input.companyId),
      eq(hmrcOauthStatesTable.ownerUserId, input.ownerUserId),
      isNull(hmrcOauthStatesTable.usedAt),
      gt(hmrcOauthStatesTable.expiresAt, new Date()),
    ))
    .returning();
  return claimedState ?? null;
}