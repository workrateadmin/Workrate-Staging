import {
  getWorkRateEnvironment,
  type WorkRateEnvironment,
} from "./runtime-environment";

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
): RuntimeConfig {
  const workRateEnvironment = getWorkRateEnvironment(environment);
  const buildId = environment["WORKRATE_BUILD_ID"]?.trim();

  if (buildId) {
    return { environment: workRateEnvironment, buildId };
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