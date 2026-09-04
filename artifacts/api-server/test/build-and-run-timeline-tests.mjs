import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(artifactDir, "../../lib/db/.timeline-test-dist");
const outputFile = path.join(outputDir, "timeline.test.cjs");
try {
  const generatedClient = await readFile(path.resolve(artifactDir, "../../lib/api-client-react/src/generated/api.ts"), "utf8");
  if (!generatedClient.includes("return `/api/jobs/${id}`")) throw new Error("Generated updateJob URL is not /api/jobs/{id}");
  const invoiceRoute = await readFile(path.join(artifactDir, "src/routes/invoices.ts"), "utf8");
  const ownershipUses = invoiceRoute.match(/validateInvoiceJobLink\(body\.jobId, userId!\)/g) ?? [];
  if (ownershipUses.length !== 2) throw new Error("Invoice create and update must both validate job ownership");
  if (!invoiceRoute.includes("innerJoin(enquiriesTable, eq(jobsTable.enquiryId, enquiriesTable.id))") || !invoiceRoute.includes("eq(enquiriesTable.ownerUserId, userId)")) {
    throw new Error("Invoice job ownership helper must join through the enquiry owner predicate");
  }
  await build({ entryPoints: [path.join(artifactDir, "test", "timeline.test.ts")], bundle: true, platform: "node", format: "cjs", target: "node24", outfile: outputFile, logLevel: "info" });
  const result = spawnSync(process.execPath, ["--test", outputFile], { cwd: artifactDir, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://timeline:timeline@localhost:5432/timeline" }, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}