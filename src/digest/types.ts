// The night's run log, one row per job. Contract for the digest page, its JSON and the board.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string; // ISO 8601 with the log's offset, kept as written
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  owner: string | null; // null renders as '—'; the row is kept
  runs: number; // lines for this job, any status
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus; // status of the job's latest line
  lastError: string | null; // most recent error seen for the job this night
  firstAt: string; // earliest `at`, offset kept as in the log
  lastAt: string; // latest `at`, offset kept as in the log
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse or didn't fit RunLine; counted, never thrown
};

// Reads runs/<night>.jsonl. Returns null when there is no file for that night (or the name
// isn't a YYYY-MM-DD night). An empty file is a Night with no rows. Never throws on content.
export type ReadNight = (runsDir: string, night: string) => Night | null;
