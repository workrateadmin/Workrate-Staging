export type RuntimeEnvironment = "development" | "staging" | "production";

export interface RuntimeConfig {
  environment: RuntimeEnvironment;
  buildId: string;
}

const runtimeConfigPath = "/api/runtime-config";

export function isRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (!value || typeof value !== "object") return false;

  const { environment, buildId } = value as Record<string, unknown>;
  return (
    (environment === "development" ||
      environment === "staging" ||
      environment === "production") &&
    typeof buildId === "string" &&
    buildId.length > 0
  );
}

/**
 * Runtime environment is server-owned. Do not replace this with hostname,
 * build-mode, or environment-variable detection.
 */
export async function fetchRuntimeConfig(
  fetcher: typeof fetch = fetch,
): Promise<RuntimeConfig> {
  const response = await fetcher(runtimeConfigPath, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Unable to load runtime configuration (${response.status})`);
  }

  const config: unknown = await response.json();
  if (!isRuntimeConfig(config)) {
    throw new Error("Runtime configuration has an invalid shape");
  }

  return config;
}