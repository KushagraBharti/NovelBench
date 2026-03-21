import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const tsconfigPath = join(process.cwd(), "tsconfig.json");
const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8"));
const include = Array.isArray(tsconfig.include) ? tsconfig.include : [];
tsconfig.include = include.filter(
  (entry) =>
    entry !== ".next-foundation/types/**/*.ts" &&
    entry !== ".next-foundation/dev/types/**/*.ts" &&
    entry !== ".next-build/types/**/*.ts" &&
    entry !== ".next-build/dev/types/**/*.ts",
);
await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
