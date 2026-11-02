// Contract for the morning digest (plan.md § 1). The reader lives elsewhere in src/digest/.

/** Status of a single run line in `runs/<night>.jsonl`. */
export type RunStatus = "ok" | "retry" | "fail";

/** One row per job for a night, folded from every log line of that job. */
export type DigestRow = {
  /** Job name, as in the log's `job` field. */
  job: string;
  /** Owner from the log; `null` when the log says so (rendered as `—`). Last seen value wins. */
  owner: string | null;
  /** Number of log lines for this job (every status counts). */
  runs: number;
  /** Number of lines with status `retry`. */
  retries: number;
  /** Number of lines with status `fail`. (`runs - retries - fails` = ok lines.) */
  fails: number;
  /** Status of the latest line (by `at`) for this job. */
  lastStatus: RunStatus;
  /** `error` of the latest line that had one; `null` if none did (rendered as `—`). */
  lastError: string | null;
  /** Earliest `at`, verbatim from the log (offset kept, never converted to UTC). */
  firstAt: string;
  /** Latest `at`, verbatim from the log (offset kept, never converted to UTC). */
  lastAt: string;
};

/** A parsed night. */
export type Night = {
  /** Night id, e.g. `2026-10-28` (the file name without `.jsonl`). */
  night: string;
  /** One row per job, sorted by `job` ascending. Empty for an empty file ("nothing ran"). */
  rows: DigestRow[];
  /** Lines that failed to parse or validate. Counted, never thrown. Blank lines are not counted. */
  badLines: number;
};

/**
 * Read `<runsDir>/<night>.jsonl`.
 * Returns `null` when the file does not exist (routes answer 404). Never throws on bad lines.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
