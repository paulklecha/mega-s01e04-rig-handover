import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/index.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns the same rows, in the same order, as readNight on runs/2026-10-28.jsonl', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    const source = readNight('runs', '2026-10-28')!;
    expect(body).toEqual(JSON.parse(JSON.stringify(source)));
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(body.badLines).toBe(1);
  });

  it('404s a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('gives an empty night as no rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-api-'));
    writeFileSync(join(dir, '2026-02-02.jsonl'), '');
    const res = await createApp({ ...config, runsDir: dir }).request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-02-02', rows: [], badLines: 0 });
  });
});
