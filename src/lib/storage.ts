import { promises as fs } from "fs";
import path from "path";
import { BenchmarkRun } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function saveBenchmarkRun(run: BenchmarkRun): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${run.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
}

export async function loadBenchmarkRun(
  id: string
): Promise<BenchmarkRun | null> {
  try {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as BenchmarkRun;
  } catch {
    return null;
  }
}

export async function listBenchmarkRuns(): Promise<BenchmarkRun[]> {
  await ensureDataDir();
  try {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const runs: BenchmarkRun[] = [];
    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
      runs.push(JSON.parse(content) as BenchmarkRun);
    }

    // Sort by timestamp descending (newest first)
    runs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return runs;
  } catch {
    return [];
  }
}

export async function deleteBenchmarkRun(id: string): Promise<boolean> {
  try {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
