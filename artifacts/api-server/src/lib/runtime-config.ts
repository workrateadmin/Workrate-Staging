import {
  getWorkRateEnvironment,
  type WorkRateEnvironment,
} from "./runtime-environment";
import { getEmbeddedApplicationSourceId } from "./application-source-identity";

type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export const LOCAL_DEVELOPMENT_BUILD_ID = "local-development";

export interface RuntimeConfig {
  environment: WorkRateEnvironment;
  buildId: string;
}

/**
 * Deployment identity is configured by the server, never inferred from a host
 * name or a client-side build mode.
 */
export function getRuntimeConfig(
  environment: EnvironmentVariables = process.env,
  immutableSourceId: string | null = getEmbeddedApplicationSourceId(),
): RuntimeConfig {
  const workRateEnvironment = getWorkRateEnvironment(environment);
  const configuredBuildId = environment["WORKRATE_BUILD_ID"]?.trim();

  if (workRateEnvironment !== "development" && immutableSourceId) {
    return { environment: workRateEnvironment, buildId: immutableSourceId };
  }

  if (configuredBuildId) {
    return { environment: workRateEnvironment, buildId: configuredBuildId };
  }

  if (workRateEnvironment === "development") {
    return {
      environment: workRateEnvironment,
      buildId: LOCAL_DEVELOPMENT_BUILD_ID,
    };
  }

  throw new Error(
    `WORKRATE_BUILD_ID is required when WORKRATE_ENV is ${workRateEnvironment}.`,
  );
}