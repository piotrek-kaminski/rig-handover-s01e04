import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Temp runs dir: runs/ is read-only and never touched here.
let runsDir: string;
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: '' };
const app = () => createApp({ ...config, runsDir });

const line = (job: string, status: string, owner: string | null, at: string, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

// Job names in the order the page's table shows them (first cell of each body row).
function pageJobs(html: string): string[] {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr><td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]!);
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // A normal night, written out of order on purpose.
  writeFileSync(
    join(runsDir, '2026-10-28.jsonl'),
    [
      line('lane/sync', 'retry', 'rook', '2026-10-29T01:00:00+01:00', 'lock held'),
      line('notes/backup', 'fail', null, '2026-10-29T02:00:00+01:00', 'quota exceeded'),
      line('digest/render', 'ok', 'rook', '2026-10-29T03:00:00+01:00'),
      line('fixtures/refresh', 'ok', 'rook', '2026-10-29T01:30:00+01:00'),
      line('lane/sync', 'ok', 'rook', '2026-10-29T01:05:00+01:00'),
    ].join('\n'),
  );
  // An empty night: the file exists, nothing in it.
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
  // A night with a bad line between two good ones.
  writeFileSync(
    join(runsDir, '2026-10-26.jsonl'),
    [
      line('rig/rotate-logs', 'ok', 'rook', '2026-10-27T00:10:00+01:00'),
      '{"at": "2026-10-27T00:11:00+01:00", "job": ',
      line('digest/render', 'ok', null, '2026-10-27T00:12:00+01:00'),
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('200 and a page with the jobs, sorted', async () => {
    const res = await app().request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(pageJobs(await res.text())).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']);
  });

  it('404 for a night with no file', async () => {
    expect((await app().request('/digest/2026-01-01')).status).toBe(404);
  });

  it('404 for a malformed night id', async () => {
    expect((await app().request('/digest/nope')).status).toBe(404);
  });

  it('the empty night says "nothing ran"', async () => {
    const res = await app().request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('a night with a bad line still renders and counts it', async () => {
    const res = await app().request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('1 unreadable line(s) skipped');
    expect(pageJobs(html)).toEqual(['digest/render', 'rig/rotate-logs']);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 and JSON rows, sorted', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']);
  });

  it('404 for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('404 for a malformed night id', async () => {
    expect((await app().request('/api/digest/nope')).status).toBe(404);
  });

  it('the empty night has rows []', async () => {
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('a night with a bad line reports badLines and keeps the good rows', async () => {
    const res = await app().request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'rig/rotate-logs']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-10-28', '2026-10-27', '2026-10-26'])('%s lists the same jobs in the same order', async (night) => {
    const html = await (await app().request(`/digest/${night}`)).text();
    const json = (await (await app().request(`/api/digest/${night}`)).json()) as Night;
    expect(pageJobs(html)).toEqual(json.rows.map((r) => r.job));
  });
});
