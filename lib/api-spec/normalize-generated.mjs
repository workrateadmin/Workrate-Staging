import fs from "node:fs";
import path from "node:path";

const generatedRoots = [
  path.resolve("..", "api-client-react", "src", "generated"),
  path.resolve("..", "api-zod", "src", "generated"),
];

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

for (const root of generatedRoots) {
  for (const filePath of filesUnder(root).filter((file) => file.endsWith(".ts"))) {
    const source = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(filePath, `${source.trimEnd()}\n`);
  }
}