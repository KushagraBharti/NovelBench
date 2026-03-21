import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const roots = [
  join(process.cwd(), ".next-foundation", "types"),
  join(process.cwd(), ".next-foundation", "dev", "types"),
  join(process.cwd(), ".next-build", "types"),
  join(process.cwd(), ".next-build", "dev", "types"),
];

for (const root of roots) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "cache-life.ts"), "export {};\n", "utf8");
  await writeFile(join(root, "cache-life.d.ts"), "export {};\n", "utf8");
}
