import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DigestRow, Night, ReadNight, RunStatus } from "./types.js";

type RunLine = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly string[] = ["ok", "retry", "fail"];

/** Parse and validate one log line; `null` means a bad line. */
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== "string" || typeof job !== "string") return null;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (!("owner" in o) || (owner !== null && typeof owner !== "string")) return null;
  if (error !== undefined && typeof error !== "string") return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return { at, time, job, status: status as RunStatus, owner, error: error ?? null };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows: DigestRow[] = [];
  for (const [job, lines] of byJob) {
    // Stable sort by time: equal times keep file order, so the later line wins.
    const sorted = [...lines].sort((a, b) => a.time - b.time);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const withError = sorted.filter((l) => l.error !== null);
    rows.push({
      job,
      owner: last.owner,
      runs: sorted.length,
      retries: sorted.filter((l) => l.status === "retry").length,
      fails: sorted.filter((l) => l.status === "fail").length,
      lastStatus: last.status,
      lastError: withError.length ? withError[withError.length - 1]!.error : null,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
};
