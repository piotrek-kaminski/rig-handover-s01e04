import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('has 5 jobs sorted by name and 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds every field of a row', () => {
    const row = (job: string) => night.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, fails: 0, lastStatus: 'ok', lastError: 'lock held' });
    expect(row('notes/backup')).toMatchObject({ runs: 1, fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('digest/render')).toMatchObject({ owner: null, lastError: null, runs: 1 });
  });

  it('keeps the offset from the log', () => {
    for (const r of night.rows) {
      expect(r.firstAt).toMatch(/\+01:00$/);
      expect(r.lastAt).toMatch(/\+01:00$/);
    }
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, lines: string[]) => writeFileSync(join(dir, `${name}.jsonl`), lines.join('\n'));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, 'nope')).toBeNull();
  });

  it('an empty file has no rows and no bad lines', () => {
    write('empty', ['', '  ']);
    expect(readNight(dir, 'empty')).toEqual({ night: 'empty', rows: [], badLines: 0 });
  });

  it('counts invalid lines instead of throwing', () => {
    write('bad', [
      '{not json',
      '[]',
      'null',
      JSON.stringify({ at: 1, job: 'a', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'meh', owner: null }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok' }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 3 }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: null, error: 5 }),
      JSON.stringify({ at: 'yesterday', job: 'a', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 'x' }),
    ]);
    const n = readNight(dir, 'bad')!;
    expect(n.badLines).toBe(9);
    expect(n.rows).toHaveLength(1);
  });

  it('takes the last status by `at`, not by file order', () => {
    write('order', [
      JSON.stringify({ at: '2026-10-29T02:00:00+01:00', job: 'j', status: 'fail', owner: 'b', error: 'late' }),
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'j', status: 'retry', owner: 'a', error: 'early' }),
      JSON.stringify({ at: '2026-10-29T01:30:00Z', job: 'j', status: 'ok', owner: 'c' }),
    ]);
    const [row] = readNight(dir, 'order')!.rows;
    expect(row).toEqual({
      job: 'j',
      owner: 'c',
      runs: 3,
      retries: 1,
      fails: 1,
      lastStatus: 'ok',
      lastError: 'late',
      firstAt: '2026-10-28T23:00:00+01:00',
      lastAt: '2026-10-29T01:30:00Z',
    });
  });
});
