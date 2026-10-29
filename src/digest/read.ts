import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// One line in, a RunLine or null out. Never throws.
export function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const { at, job, status, owner, error } = v;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job.trim() === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status as RunStatus)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  const run: RunLine = { at, job, status: status as RunStatus, owner: owner?.trim() || null };
  if (typeof error === 'string' && error !== '') run.error = error;
  return run;
}

type Acc = DigestRow & { firstMs: number; lastMs: number; errorMs: number; ownerMs: number };

// Many lines in, one row per job out (sorted by job) plus the count of bad lines.
export function digest(text: string): { rows: DigestRow[]; badLines: number } {
  const jobs = new Map<string, Acc>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue; // blank lines (e.g. the trailing newline) aren't runs
    const run = parseLine(raw);
    if (!run) {
      badLines++;
      continue;
    }
    const ms = Date.parse(run.at);
    let row = jobs.get(run.job);
    if (!row) {
      row = {
        job: run.job,
        owner: null,
        runs: 0,
        retries: 0,
        lastStatus: run.status,
        lastError: null,
        firstAt: run.at,
        lastAt: run.at,
        firstMs: ms,
        lastMs: ms,
        errorMs: -Infinity,
        ownerMs: -Infinity,
      };
      jobs.set(run.job, row);
    }
    row.runs++;
    if (run.status === 'retry') row.retries++;
    // Ties go to the later line in the file.
    if (ms < row.firstMs) {
      row.firstMs = ms;
      row.firstAt = run.at;
    }
    if (ms >= row.lastMs) {
      row.lastMs = ms;
      row.lastAt = run.at;
      row.lastStatus = run.status;
    }
    if (run.error && ms >= row.errorMs) {
      row.errorMs = ms;
      row.lastError = run.error;
    }
    if (run.owner && ms >= row.ownerMs) {
      row.ownerMs = ms;
      row.owner = run.owner;
    }
  }

  const rows = [...jobs.values()]
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0))
    .map(({ job, owner, runs, retries, lastStatus, lastError, firstAt, lastAt }) => ({
      job,
      owner,
      runs,
      retries,
      lastStatus,
      lastError,
      firstAt,
      lastAt,
    }));
  return { rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const result: Night = { night, ...digest(text) };
  return result;
};
