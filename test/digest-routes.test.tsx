import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Route tests through app.request(). A temp runs dir, so runs/ stays read-only.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
const config: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};

const GOOD = [
  '{"at":"2026-10-29T01:00:00+01:00","job":"zeta","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T01:10:00+01:00","job":"alpha","status":"retry","owner":null,"error":"boom"}',
  '{"at":"2026-10-29T01:20:00+01:00","job":"alpha","status":"retry","owner":null,"error":"boom"}',
  '{"at":"2026-10-29T01:30:00+01:00","job":"alpha","status":"retry","owner":null,"error":"boom"}',
  '{"at":"2026-10-29T01:40:00+01:00","job":"mid","status":"fail","owner":"lane-07","error":"quota exceeded"}',
].join('\n');

beforeAll(() => {
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), GOOD + '\n');
  writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-10-30.jsonl'),
    ['not json', '{"at":"2026-10-30T01:00:00+01:00","job":"ok-job","status":"ok","owner":"rook"}'].join('\n') + '\n',
  );
});

describe('GET /digest/:night', () => {
  it('200 and an HTML page with one row per job, sorted by job', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const order = ['alpha', 'mid', 'zeta'].map((j) => html.indexOf(j));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('marks retries of 3 or more and any fail', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(html).toMatch(/class="warn"[^>]*>[^<]*alpha|alpha[^]*?class="warn"/);
    expect(html).toMatch(/class="warn"[^>]*>[^<]*mid|mid[^]*?class="warn"/);
  });

  it('shows a null owner as —', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(html).toContain('—');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('404 for a name that is not a night', async () => {
    const res = await createApp(config).request('/digest/not-a-night');
    expect(res.status).toBe(404);
  });

  it('200 for the empty night, which says "nothing ran"', async () => {
    const res = await createApp(config).request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('200 for a night with a bad line; the good rows still render', async () => {
    const res = await createApp(config).request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('ok-job');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 and JSON with the same rows, in the same order, as the page', async () => {
    const app = createApp(config);
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);

    const html = await (await app.request('/digest/2026-10-28')).text();
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('keeps owner null as null in JSON; the row stays', async () => {
    const body = (await (await createApp(config).request('/api/digest/2026-10-28')).json()) as {
      rows: { job: string; owner: string | null }[];
    };
    expect(body.rows.find((r) => r.job === 'alpha')).toMatchObject({ owner: null });
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('200 and no rows for the empty night', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-29', rows: [], badLines: 0 });
  });

  it('200 for a bad line and counts it in badLines', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['ok-job']);
  });
});
