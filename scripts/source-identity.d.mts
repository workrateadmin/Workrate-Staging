export const DEPLOYABLE_SOURCE_PATHS: readonly string[];

export function assertFullGitSha(value: unknown): string;

export function resolveDeployableSourceIdentity(options?: {
  cwd?: string;
  executeGit?: (
    file: string,
    args: readonly string[],
    options: {
      cwd: string;
      encoding: "utf8";
      stdio: readonly ["ignore", "pipe", "pipe"];
    },
  ) => string;
}): string;