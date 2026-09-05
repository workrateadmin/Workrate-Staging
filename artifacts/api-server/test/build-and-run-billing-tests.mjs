import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(artifactDir, ".billing-test-dist");
const outputFile = path.join(outputDir, "billing.test.mjs");
try {
  await build({ entryPoints: [path.join(artifactDir, "test", "billing.test.ts")], bundle: true, platform: "node", format: "esm", target: "node24", outfile: outputFile, logLevel: "info", alias: { pg: path.resolve(artifactDir, "../../lib/db/node_modules/pg/lib/index.js") }, external: ["express", "sharp", "@replit/connectors-sdk"], banner: { js: "import { createRequire as __testCreateRequire } from 'node:module'; const require = __testCreateRequire(import.meta.url);" } });
  const result = spawnSync(process.execPath, ["--test", outputFile], { cwd: artifactDir, env: process.env, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}