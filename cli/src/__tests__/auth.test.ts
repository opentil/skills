import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), `opentil-test-auth-${process.pid}`);
const CREDS_PATH = join(TMP, '.til', 'credentials');

// Mock utils to redirect home
vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils.js')>();
  return {
    ...actual,
    home: TMP,
    readTextFile: (path: string) => {
      try {
        const { readFileSync } = require('node:fs');
        return readFileSync(path, 'utf-8');
      } catch {
        return null;
      }
    },
  };
});

const { readExistingCredentials, validateToken } = await import('../auth.js');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, '.til'), { recursive: true });
  // Clear env vars
  delete process.env.OPENTIL_TOKEN;
  delete process.env.OPENTIL_HOST;
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  delete process.env.OPENTIL_TOKEN;
  delete process.env.OPENTIL_HOST;
});

describe('readExistingCredentials', () => {
  it('returns env token when OPENTIL_TOKEN is set', () => {
    process.env.OPENTIL_TOKEN = 'til_envtoken';
    const creds = readExistingCredentials();
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe('til_envtoken');
    expect(creds!.source).toBe('env');
    expect(creds!.host).toBe('https://opentil.ai');
  });

  it('uses OPENTIL_HOST when set', () => {
    process.env.OPENTIL_TOKEN = 'til_abc';
    process.env.OPENTIL_HOST = 'https://custom.example.com';
    const creds = readExistingCredentials();
    expect(creds!.host).toBe('https://custom.example.com');
  });

  it('reads from credentials file when no env var', () => {
    writeFileSync(CREDS_PATH, [
      'active: testuser',
      'profiles:',
      '  testuser:',
      '    token: til_filetoken',
    ].join('\n'));
    const creds = readExistingCredentials();
    expect(creds).not.toBeNull();
    expect(creds!.token).toBe('til_filetoken');
    expect(creds!.source).toBe('file');
  });

  it('returns null when no credentials available', () => {
    expect(readExistingCredentials()).toBeNull();
  });

  it('returns null when credentials file is empty', () => {
    writeFileSync(CREDS_PATH, '');
    expect(readExistingCredentials()).toBeNull();
  });

  it('returns null when profile has no token', () => {
    writeFileSync(CREDS_PATH, [
      'active: emptyuser',
      'profiles:',
      '  emptyuser:',
      '    host: https://example.com',
    ].join('\n'));
    // The profile exists but token is empty string
    const creds = readExistingCredentials();
    expect(creds).toBeNull();
  });
});

describe('validateToken', () => {
  it('returns valid with username on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ username: 'testuser' }),
    }));
    const result = await validateToken('til_abc', 'https://opentil.ai');
    expect(result).toEqual({ status: 'valid', username: 'testuser' });
  });

  it('returns expired on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }));
    const result = await validateToken('til_expired', 'https://opentil.ai');
    expect(result).toEqual({ status: 'expired' });
  });

  it('returns expired on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }));
    const result = await validateToken('til_forbidden', 'https://opentil.ai');
    expect(result).toEqual({ status: 'expired' });
  });

  it('returns network_error on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));
    const result = await validateToken('til_abc', 'https://opentil.ai');
    expect(result).toEqual({ status: 'network_error', error: 'HTTP 500' });
  });

  it('returns network_error on fetch exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const result = await validateToken('til_abc', 'https://opentil.ai');
    expect(result.status).toBe('network_error');
    expect(result).toHaveProperty('error', 'timeout');
  });

  it('returns expired when 200 but no username', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const result = await validateToken('til_abc', 'https://opentil.ai');
    expect(result).toEqual({ status: 'expired' });
  });
});
