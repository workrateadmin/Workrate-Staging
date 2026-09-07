export type FixtureEnvironment = "development" | "staging";

/**
 * Fixture commands must make their deployment target explicit. This function
 * intentionally does not accept production, aliases, or inferred environments.
 */
export function assertSyntheticFixtureEnvironment(
  environment: string | undefined,
): FixtureEnvironment {
  if (environment === "development" || environment === "staging") {
    return environment;
  }

  throw new Error(
    "Synthetic fixtures are permitted only when WORKRATE_ENV is exactly development or staging; production and unknown environments are refused.",
  );
}

export function getSyntheticOwnerId(argv: readonly string[]): string {
  const ownerFlag = argv.indexOf("--owner");
  const ownerId = ownerFlag === -1 ? undefined : argv[ownerFlag + 1]?.trim();

  if (!ownerId || ownerId.startsWith("-")) {
    throw new Error(
      "A non-empty synthetic owner identifier is required: --owner <clerk-user-id>.",
    );
  }

  return ownerId;
}