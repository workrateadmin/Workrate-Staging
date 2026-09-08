import { execFileSync } from "node:child_process";

export const DEPLOYABLE_SOURCE_PATHS = Object.freeze([
  "artifacts",
  "lib",
  "scripts",
  "services",
  ".npmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
]);

export function assertFullGitSha(value) {
  const sourceId = String(value ?? "").trim();
  if (!/^[a-f0-9]{40}$/.test(sourceId)) {
    throw new Error(
      "Deployable application source identity must be a full 40-character lowercase Git SHA.",
    );
  }
  return sourceId;
}

export function resolveDeployableSourceIdentity({
  cwd = process.cwd(),
  executeGit = execFileSync,
} = {}) {
  let status;
  let output;
  try {
    status = executeGit(
      "git",
      ["status", "--porcelain", "--", ...DEPLOYABLE_SOURCE_PATHS],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (String(status).trim()) {
      throw new Error("deployable source is dirty");
    }
    output = executeGit(
      "git",
      ["log", "-1", "--format=%H", "--", ...DEPLOYABLE_SOURCE_PATHS],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "deployable source is dirty"
    ) {
      throw new Error(
        "Deployable application source has uncommitted changes; refusing to assign an immutable source identity.",
      );
    }
    throw new Error(
      "Unable to resolve immutable deployable application source identity from Git history.",
    );
  }
  return assertFullGitSha(output);
}