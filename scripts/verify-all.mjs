import { spawnSync } from "node:child_process";

const commands = [
  "bun install",
  "bun test",
  "bun run lint",
  "bun run typecheck",
  "bun run build",
];

for (const command of commands) {
  console.log(`\n> ${command}\n`);
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

