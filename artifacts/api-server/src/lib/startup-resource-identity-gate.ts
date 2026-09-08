import type { ReleaseStorageVerification } from "./release-storage-validation";

export class StartupResourceIdentityGateError extends Error {
  constructor(readonly verification: ReleaseStorageVerification) {
    super(
      `${verification.code ?? "STORAGE_BINDING_UNVERIFIED"}: ${verification.message}`,
    );
  }
}

export async function runAfterStartupResourceIdentityGate<T>(
  verify: () => Promise<ReleaseStorageVerification>,
  start: (verification: ReleaseStorageVerification) => Promise<T>,
): Promise<T> {
  const verification = await verify();
  if (verification.status !== "pass" || !verification.environment) {
    throw new StartupResourceIdentityGateError(verification);
  }
  return start(verification);
}