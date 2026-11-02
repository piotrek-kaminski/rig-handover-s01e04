import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Counts = { ok: number; retry: number; fail: number };

export type NightEntry = {
  night: string;
  /** Summed over the night's log lines; `null` when the night could not be read. */
  counts: Counts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightEntry[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Counts per log line: ok = runs - retries - fails, retry, fail.
export function countsFor(runsDir: string, night: string): Counts | null {
  const parsed = readNight(runsDir, night);
  if (!parsed) return null;
  return parsed.rows.reduce<Counts>(
    (acc, r) => ({
      ok: acc.ok + (r.runs - r.retries - r.fails),
      retry: acc.retry + r.retries,
      fail: acc.fail + r.fails,
    }),
    { ok: 0, retry: 0, fail: 0 },
  );
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: countsFor(config.runsDir, night),
    })),
  };
}
