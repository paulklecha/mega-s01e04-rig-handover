import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// runs/ is read-only: the tests use a temp dir.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const line = (o: Record<string, unknown>) => JSON.stringify(o);
writeFileSync(
  join(runsDir, '2026-10-28.jsonl'),
  [
    line({ at: '2026-10-28T23:00:02+01:00', job: 'rig/rotate-logs', status: 'ok', owner: 'lane-07' }),
    line({ at: '2026-10-29T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
    line({ at: '2026-10-29T01:31:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
    line({ at: '2026-10-29T01:33:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' }),
    line({ at: '2026-10-29T04:00:01+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
    line({ at: '2026-10-29T05:41:09+01:00', job: 'digest/render', status: 'ok', owner: null }),
    'not json at all',
    '',
  ].join('\n'),
);
writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
const app = createApp(config);

describe('GET /digest/:night', () => {
  beforeAll(() => {
    process.env.LANE_MARKER = 'TEST-MARKER';
  });

  it('renders one row per job, sorted by job, with the lane banner', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const order = ['digest/render', 'fixtures/refresh', 'notes/backup', 'rig/rotate-logs'].map((j) => html.indexOf(j));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('flags retries of 3 or more and any fail', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(html).toContain('retries 3');
    expect(html).toContain('<span class="warn">fail</span>');
    expect(html).not.toContain('retries 0');
  });

  it('renders missing data as a dash', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(html).toMatch(/<td>digest\/render<\/td><td>—<\/td>/);
  });

  it('counts unreadable lines without dropping the night', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(html).toContain('1 unreadable line(s) skipped');
    expect(html).toContain('rig/rotate-logs');
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a name that is not a night', async () => {
    const res = await app.request('/digest/..%2Fsecret');
    expect(res.status).toBe(404);
  });
});
