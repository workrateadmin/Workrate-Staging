export const WORKRATE_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type WorkRateEnvironment = (typeof WORKRATE_ENVIRONMENTS)[number];

type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export function getWorkRateEnvironment(
  environment: EnvironmentVariables = process.env,
): WorkRateEnvironment {
  const value = environment["WORKRATE_ENV"];

  if (
    value !== "development" &&
    value !== "staging" &&
    value !== "production"
  ) {
    throw new Error(
      `WORKRATE_ENV must be one of ${WORKRATE_ENVIRONMENTS.join(", ")}; received ${value === undefined ? "no value" : `"${value}"`}.`,
    );
  }

  return value;
}

export function isProductionEnvironment(
  workRateEnvironment: WorkRateEnvironment,
): boolean {
  return workRateEnvironment === "production";
}

function commaSeparatedValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Customer communications are deliberately off outside production. A non-prod
 * email additionally requires an exact recipient allowlist; it is never
 * redirected to another address.
 */
export function canSendCustomerEmail(
  recipient: string,
  environment: EnvironmentVariables = process.env,
): boolean {
  const workRateEnvironment = getWorkRateEnvironment(environment);
  if (isProductionEnvironment(workRateEnvironment)) return true;
  if (environment["WORKRATE_NON_PRODUCTION_CUSTOMER_COMMS_ENABLED"] !== "true") {
    return false;
  }
  return commaSeparatedValues(
    environment["WORKRATE_NON_PRODUCTION_EMAIL_ALLOWLIST"],
  ).includes(recipient.trim().toLowerCase());
}

export function canSendCustomerMessages(
  environment: EnvironmentVariables = process.env,
): boolean {
  return isProductionEnvironment(getWorkRateEnvironment(environment))
    || environment["WORKRATE_NON_PRODUCTION_CUSTOMER_COMMS_ENABLED"] === "true";
}

function assertNonProductionStorageNamespace(
  value: string | undefined,
  variableName: string,
): void {
  if (!value) return;
  // The storage integration exposes bucket paths, not a provider environment
  // field. Reserve production/prod names so a non-production deployment can
  // never accidentally point at the production namespace.
  if (/(^|[\/_-])(production|prod)([\/_-]|$)/i.test(value)) {
    throw new Error(
      `${variableName} must not reference a production storage namespace outside production.`,
    );
  }
}

/**
 * Validate provider/environment boundaries before opening external connections.
 * This intentionally validates only configured providers: integrations stored
 * per tenant are guarded at send time.
 */
export function assertRuntimeEnvironmentSafety(
  environment: EnvironmentVariables = process.env,
): WorkRateEnvironment {
  const workRateEnvironment = getWorkRateEnvironment(environment);
  const stripeKey = environment["STRIPE_SECRET_KEY"]?.trim();
  if (
    !isProductionEnvironment(workRateEnvironment) &&
    stripeKey?.startsWith("sk_live_")
  ) {
    throw new Error("Stripe live secret keys are forbidden outside production.");
  }

  // All currently implemented HMRC routes are explicitly sandbox routes. Do
  // not add a production target by configuration; doing so requires a future
  // audited code change.
  if (
    environment["HMRC_PRODUCTION_GATEWAY_URL"] ||
    environment["HMRC_PRODUCTION_GATEWAY_HMAC_SECRET"]
  ) {
    throw new Error("Production HMRC gateway configuration is not supported.");
  }

  const gatewayUrl = environment["HMRC_GATEWAY_URL"] ??
    environment["HMRC_SANDBOX_GATEWAY_URL"];
  if (gatewayUrl) {
    let parsed: URL;
    try {
      parsed = new URL(gatewayUrl);
    } catch {
      throw new Error("HMRC sandbox gateway URL is invalid.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "hmrc-gateway.work-rate.uk" ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("HMRC gateway must remain pinned to the approved sandbox gateway origin.");
    }
  }

  const storageConfigured = Boolean(
    environment["DEFAULT_OBJECT_STORAGE_BUCKET_ID"] ||
    environment["PRIVATE_OBJECT_DIR"] ||
    environment["PUBLIC_OBJECT_SEARCH_PATHS"],
  );
  const storageEnvironment = environment["WORKRATE_STORAGE_ENV"];
  if (storageConfigured && storageEnvironment !== workRateEnvironment) {
    throw new Error(
      `WORKRATE_STORAGE_ENV must match WORKRATE_ENV when storage is configured.`,
    );
  }

  if (!isProductionEnvironment(workRateEnvironment)) {
    assertNonProductionStorageNamespace(
      environment["PRIVATE_OBJECT_DIR"],
      "PRIVATE_OBJECT_DIR",
    );
    assertNonProductionStorageNamespace(
      environment["PUBLIC_OBJECT_SEARCH_PATHS"],
      "PUBLIC_OBJECT_SEARCH_PATHS",
    );
  }
  return workRateEnvironment;
}

/**
 * Only development applies application migrations during startup. Staging and
 * production schemas are promoted explicitly by the deployment workflow.
 */
export function shouldRunMigrations(
  workRateEnvironment: string,
  environment: EnvironmentVariables = process.env,
): boolean {
  switch (workRateEnvironment) {
    case "development":
      return true;
    case "staging":
    case "production":
      return false;
    default:
      return false;
  }
}