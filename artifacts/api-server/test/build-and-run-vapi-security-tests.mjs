import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(artifactDir, ".vapi-test-dist");
const outputFile = path.join(outputDir, "vapi-security.test.mjs");

try {
  await build({
    entryPoints: [path.join(artifactDir, "test", "vapi-security.test.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["express", "sharp"],
    banner: { js: "import { createRequire as __testCreateRequire } from 'node:module'; const require = __testCreateRequire(import.meta.url);" },
    outfile: outputFile,
    logLevel: "info",
  });
  const result = spawnSync(process.execPath, ["--test", outputFile], {
    cwd: artifactDir,
    env: process.env,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}