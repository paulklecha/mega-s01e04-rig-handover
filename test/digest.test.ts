import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/index.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs, sorted by job, and counts 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('builds each row: runs, retries, last status, last error, times with the offset kept', () => {
    const byJob = Object.fromEntries(night!.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['lane/sync']).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(byJob['notes/backup']).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(byJob['rig/rotate-logs']).toMatchObject({ lastStatus: 'ok', lastError: null });
  });

  it('keeps a job whose owner is null', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');
  writeFileSync(
    join(dir, '2026-01-02.jsonl'),
    ['not json', '[]', '{"at":"x","job":"a","status":"ok","owner":null}', '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"maybe","owner":null}', '', '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"ok"}'].join('\n'),
  );

  it('returns null for a night with no file, or a name that is not a night', () => {
    expect(readNight(dir, '2026-01-03')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
    expect(readNight('does-not-exist', '2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines that are not runs without throwing; blank lines are not counted', () => {
    const n = readNight(dir, '2026-01-02')!;
    expect(n.badLines).toBe(4);
    expect(n.rows).toEqual([
      expect.objectContaining({ job: 'a', owner: null, runs: 1 }),
    ]);
  });
});

describe('digest ordering', () => {
  it('orders by time, not file position, and keeps each time as written', () => {
    const { rows } = digest(
      [
        '{"at":"2026-10-29T03:00:00+01:00","job":"j","status":"fail","owner":"rook","error":"late"}',
        '{"at":"2026-10-29T00:30:00+00:00","job":"j","status":"retry","owner":"lane-07","error":"early"}',
      ].join('\n'),
    );
    expect(rows[0]).toMatchObject({
      owner: 'rook',
      lastStatus: 'fail',
      lastError: 'late',
      firstAt: '2026-10-29T00:30:00+00:00',
      lastAt: '2026-10-29T03:00:00+01:00',
    });
  });
});
