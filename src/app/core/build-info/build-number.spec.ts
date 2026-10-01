import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REPO,
  LookupOptions,
  formatBuildNumber,
  lookupRunNumber,
  parseRunNumber,
  pickRunNumber,
  resolveBuildDate,
} from '../../../../scripts/build-number.mjs';

describe('formatBuildNumber', () => {
  const date = new Date('2026-10-01T12:00:00Z');

  it('pads the run number to three digits', () => {
    expect(formatBuildNumber(date, 1)).toBe('2026-10-01_001');
    expect(formatBuildNumber(date, 42)).toBe('2026-10-01_042');
    expect(formatBuildNumber(date, 999)).toBe('2026-10-01_999');
  });

  it('keeps every digit above 999', () => {
    expect(formatBuildNumber(date, 1000)).toBe('2026-10-01_1000');
    expect(formatBuildNumber(date, 123456)).toBe('2026-10-01_123456');
  });

  it('uses the literal dev suffix for local builds', () => {
    expect(formatBuildNumber(date, 'dev')).toBe('2026-10-01_dev');
  });

  it('renders 000 for a failed lookup and for unusable run numbers', () => {
    expect(formatBuildNumber(date, 0)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, -5)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, 1.5)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, Number.NaN)).toBe('2026-10-01_000');
  });

  it('takes the date in UTC, not local time', () => {
    expect(formatBuildNumber(new Date('2026-12-31T23:59:59.999Z'), 7)).toBe('2026-12-31_007');
    expect(formatBuildNumber(new Date('2027-01-01T00:00:00.000Z'), 7)).toBe('2027-01-01_007');
    expect(formatBuildNumber(new Date('2026-03-01T00:30:00+05:00'), 7)).toBe('2026-02-28_007');
  });
});

describe('parseRunNumber', () => {
  it('accepts positive integers only', () => {
    expect(parseRunNumber('42')).toBe(42);
    expect(parseRunNumber(' 7 ')).toBe(7);
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '12abc', '1e3']) {
      expect(parseRunNumber(bad)).toBeNull();
    }
  });
});

describe('resolveBuildDate', () => {
  const now = new Date('2026-10-01T08:00:00Z');

  it('honours a valid SOURCE_DATE_EPOCH', () => {
    expect(resolveBuildDate('1000000000', now).toISOString()).toBe('2001-09-09T01:46:40.000Z');
    expect(resolveBuildDate('253402300799', now).getUTCFullYear()).toBe(9999);
  });

  it('falls back to now for blank, zero, negative, junk and out-of-range values', () => {
    for (const bad of [
      undefined,
      '',
      '0',
      '-5',
      'abc',
      '99999999999999999',
      '8.64e15',
      '8.64e12',
      '253402300800',
    ]) {
      expect(resolveBuildDate(bad, now)).toBe(now);
    }
  });
});

describe('pickRunNumber', () => {
  const sha = 'a'.repeat(40);

  it('takes the highest run number for the commit', () => {
    const body = {
      workflow_runs: [
        { run_number: 40, event: 'push', head_sha: sha },
        { run_number: 42, event: 'push', head_sha: sha },
        { run_number: 41, event: 'pull_request', head_sha: sha },
      ],
    };
    expect(pickRunNumber(body, sha)).toBe(42);
  });

  it('prefers push and pull_request runs over other events', () => {
    const body = {
      workflow_runs: [
        { run_number: 50, event: 'workflow_dispatch', head_sha: sha },
        { run_number: 45, event: 'push', head_sha: sha },
      ],
    };
    expect(pickRunNumber(body, sha)).toBe(45);
    expect(pickRunNumber({ workflow_runs: [body.workflow_runs[0]] }, sha)).toBe(50);
  });

  it('ignores runs of other commits and malformed entries', () => {
    const body = {
      workflow_runs: [
        { run_number: 99, event: 'push', head_sha: 'b'.repeat(40) },
        { run_number: 'x', event: 'push', head_sha: sha },
        { run_number: 0, event: 'push', head_sha: sha },
        null,
      ],
    };
    expect(pickRunNumber(body, sha)).toBeNull();
  });

  it('returns null for an empty or unexpected body', () => {
    expect(pickRunNumber({ workflow_runs: [] }, sha)).toBeNull();
    expect(pickRunNumber({}, sha)).toBeNull();
    expect(pickRunNumber(null, sha)).toBeNull();
  });
});

describe('lookupRunNumber', () => {
  const sha = 'c0ffee'.padEnd(40, '0');
  type Fetch = NonNullable<LookupOptions['fetchImpl']>;

  const ok = (runNumber: number) => ({
    ok: true,
    status: 200,
    json: async () => ({
      workflow_runs: [{ run_number: runNumber, event: 'push', head_sha: sha }],
    }),
  });
  const empty = { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
  const http = (status: number) => ({ ok: false, status, json: async () => ({}) });

  function lookup(fetchImpl: Fetch, extra: Partial<LookupOptions> = {}) {
    const sleep = vi.fn(async () => undefined);
    const result = lookupRunNumber({ sha, fetchImpl, sleep, retryDelayMs: 3000, ...extra });
    return { result, sleep };
  }

  it('returns the run number on success and queries the right URL', async () => {
    const fetchStub = vi.fn<Fetch>(async () => ok(42));
    const { result, sleep } = lookup(fetchStub);
    expect(await result).toEqual({ runNumber: 42, error: null });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    const url = new URL(fetchStub.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      `https://api.github.com/repos/${DEFAULT_REPO}/actions/workflows/build.yml/runs`,
    );
    expect(url.searchParams.get('head_sha')).toBe(sha);
    expect(url.searchParams.get('per_page')).toBe('20');
  });

  it('sends Accept and User-Agent, and Authorization only when a token is given', async () => {
    const anonymous = vi.fn<Fetch>(async () => ok(1));
    await lookup(anonymous).result;
    const headers = anonymous.mock.calls[0][1].headers;
    expect(headers['Accept']).toBe('application/vnd.github+json');
    expect(headers['User-Agent']).toBeTruthy();
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('authorization');

    for (const token of [undefined, '']) {
      const stub = vi.fn<Fetch>(async () => ok(1));
      await lookup(stub, { token }).result;
      expect(stub.mock.calls[0][1].headers['Authorization']).toBeUndefined();
    }

    const authed = vi.fn<Fetch>(async () => ok(1));
    await lookup(authed, { token: 'test-token' }).result;
    expect(authed.mock.calls[0][1].headers['Authorization']).toBe('Bearer test-token');
  });

  it('retries an empty result (run not created yet) and then succeeds', async () => {
    const fetchStub = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(ok(7));
    const { result, sleep } = lookup(fetchStub);
    expect(await result).toEqual({ runNumber: 7, error: null });
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('gives up after four attempts when no run ever appears', async () => {
    const fetchStub = vi.fn<Fetch>(async () => empty);
    const { result, sleep } = lookup(fetchStub);
    const { runNumber, error } = await result;
    expect(runNumber).toBeNull();
    expect(error).toMatch(/no Build workflow run/);
    expect(fetchStub).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('retries server errors but stops at once on client errors such as rate limiting', async () => {
    const flaky = vi.fn<Fetch>().mockResolvedValueOnce(http(502)).mockResolvedValueOnce(ok(9));
    expect(await lookup(flaky).result).toEqual({ runNumber: 9, error: null });
    expect(flaky).toHaveBeenCalledTimes(2);

    const down = vi.fn<Fetch>(async () => http(503));
    const downResult = await lookup(down).result;
    expect(downResult.error).toBe('GitHub API answered HTTP 503');
    expect(down).toHaveBeenCalledTimes(4);

    const limited = vi.fn<Fetch>(async () => http(403));
    const limitedResult = await lookup(limited).result;
    expect(limitedResult).toEqual({ runNumber: null, error: 'GitHub API answered HTTP 403' });
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it('aborts a request that exceeds the timeout, then retries', async () => {
    const hanging: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const fetchStub = vi.fn<Fetch>(hanging).mockImplementationOnce(hanging);
    fetchStub.mockImplementationOnce(hanging).mockImplementationOnce(async () => ok(5));
    const { result } = lookup(fetchStub, { timeoutMs: 10 });
    expect(await result).toEqual({ runNumber: 5, error: null });
    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it('reports a timeout and a network failure without throwing', async () => {
    const hanging: Fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const timedOut = await lookup(hanging, { timeoutMs: 5, attempts: 2 }).result;
    expect(timedOut).toEqual({ runNumber: null, error: 'request timed out after 5 ms' });

    const offline = await lookup(async () => Promise.reject(new TypeError('fetch failed'))).result;
    expect(offline.runNumber).toBeNull();
    expect(offline.error).toBe('request failed (fetch failed)');
  });

  it('never puts the token in the reported error', async () => {
    const result = await lookup(async () => http(500), { token: 'secret-token-value' }).result;
    expect(JSON.stringify(result)).not.toContain('secret-token-value');
  });
});
