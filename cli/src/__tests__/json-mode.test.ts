import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseFlags,
  enableJsonMode,
  isJsonMode,
  jsonOutput,
  jsonError,
  _resetJsonMode,
} from '../json-mode.js';

beforeEach(() => {
  _resetJsonMode();
});

// ─── parseFlags ─────────────────────────────────────────────────────

describe('parseFlags', () => {
  const argv = (args: string) => ['node', 'script', ...args.split(' ').filter(Boolean)];

  it('extracts command as first positional argument', () => {
    const flags = parseFlags(argv('install'));
    expect(flags.command).toBe('install');
    expect(flags.positionals).toEqual(['install']);
  });

  it('returns undefined command when no args given', () => {
    const flags = parseFlags(['node', 'script']);
    expect(flags.command).toBeUndefined();
    expect(flags.positionals).toEqual([]);
  });

  it('parses --json flag', () => {
    const flags = parseFlags(argv('install --json'));
    expect(flags.json).toBe(true);
    expect(flags.command).toBe('install');
  });

  it('defaults json to false', () => {
    const flags = parseFlags(argv('install'));
    expect(flags.json).toBe(false);
  });

  it('parses --agent with value', () => {
    const flags = parseFlags(argv('install --agent claude-code'));
    expect(flags.agent).toBe('claude-code');
  });

  it('parses --extras with value', () => {
    const flags = parseFlags(argv('install --extras hooks,agent-md'));
    expect(flags.extras).toBe('hooks,agent-md');
  });

  it('parses --token with value', () => {
    const flags = parseFlags(argv('install --token abc123'));
    expect(flags.token).toBe('abc123');
  });

  it('parses --skip-auth boolean flag', () => {
    const flags = parseFlags(argv('install --skip-auth'));
    expect(flags.skipAuth).toBe(true);
  });

  it('parses --profile with value', () => {
    const flags = parseFlags(argv('install --profile dev'));
    expect(flags.profile).toBe('dev');
  });

  it('ignores --agent at end of args (no value)', () => {
    const flags = parseFlags(argv('install --agent'));
    expect(flags.agent).toBeUndefined();
    expect(flags.command).toBe('install');
  });

  it('skips unknown flags silently', () => {
    const flags = parseFlags(argv('install --verbose --debug'));
    expect(flags.command).toBe('install');
    expect(flags.positionals).toEqual(['install']);
  });

  it('handles mixed flags and positionals', () => {
    const flags = parseFlags(argv('--json install --agent cursor extra-pos'));
    expect(flags.json).toBe(true);
    expect(flags.agent).toBe('cursor');
    expect(flags.command).toBe('install');
    expect(flags.positionals).toContain('extra-pos');
  });

  it('skips first two elements of argv (node + script)', () => {
    const flags = parseFlags(['node', '/path/to/script.js', 'doctor', '--json']);
    expect(flags.command).toBe('doctor');
    expect(flags.json).toBe(true);
  });

  it('handles all flags combined', () => {
    const flags = parseFlags(argv('install --json --agent all --extras hooks --token tk --skip-auth --profile prod'));
    expect(flags.json).toBe(true);
    expect(flags.agent).toBe('all');
    expect(flags.extras).toBe('hooks');
    expect(flags.token).toBe('tk');
    expect(flags.skipAuth).toBe(true);
    expect(flags.profile).toBe('prod');
    expect(flags.command).toBe('install');
  });

  it('does not set skipAuth by default', () => {
    const flags = parseFlags(argv('install'));
    expect(flags.skipAuth).toBeUndefined();
  });
});

// ─── enableJsonMode / isJsonMode ────────────────────────────────────

describe('enableJsonMode / isJsonMode', () => {
  it('defaults to false', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('returns true after enableJsonMode()', () => {
    enableJsonMode();
    expect(isJsonMode()).toBe(true);
  });

  it('resets back to false via _resetJsonMode()', () => {
    enableJsonMode();
    expect(isJsonMode()).toBe(true);
    _resetJsonMode();
    expect(isJsonMode()).toBe(false);
  });
});

// ─── jsonOutput / jsonError ─────────────────────────────────────────
// These functions call process.stdout.write then process.exit.
// Vitest intercepts process.exit, so we replace them locally in each test.

describe('jsonOutput', () => {
  let captured: string;
  let exitCode: number | undefined;
  const origWrite = process.stdout.write;
  const origExit = process.exit;

  beforeEach(() => {
    captured = '';
    exitCode = undefined;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('exit');
    }) as never;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    process.exit = origExit;
  });

  it('writes formatted JSON + newline to stdout and exits 0', () => {
    expect(() => jsonOutput({ ok: true })).toThrow('exit');
    expect(exitCode).toBe(0);
    expect(captured).toBe(JSON.stringify({ ok: true }, null, 2) + '\n');
  });

  it('handles nested objects', () => {
    expect(() => jsonOutput({ a: { b: [1, 2] } })).toThrow('exit');
    const parsed = JSON.parse(captured);
    expect(parsed.a.b).toEqual([1, 2]);
  });

  it('outputs parseable JSON that round-trips to the original object', () => {
    const data = { foo: 'bar', num: 42, arr: [1, 'two'] };
    expect(() => jsonOutput(data)).toThrow('exit');
    expect(JSON.parse(captured)).toEqual(data);
  });

  it('calls process.exit(0)', () => {
    expect(() => jsonOutput({})).toThrow('exit');
    expect(exitCode).toBe(0);
  });
});

describe('jsonError', () => {
  let captured: string;
  let exitCode: number | undefined;
  const origWrite = process.stdout.write;
  const origExit = process.exit;

  beforeEach(() => {
    captured = '';
    exitCode = undefined;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error('exit');
    }) as never;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
    process.exit = origExit;
  });

  it('writes error field and exits 1', () => {
    expect(() => jsonError('something failed')).toThrow('exit');
    const parsed = JSON.parse(captured);
    expect(parsed.error).toBe('something failed');
    expect(exitCode).toBe(1);
  });

  it('includes code when provided', () => {
    expect(() => jsonError('fail', 'ERR_CODE')).toThrow('exit');
    expect(JSON.parse(captured).code).toBe('ERR_CODE');
  });

  it('omits code field when not provided', () => {
    expect(() => jsonError('fail')).toThrow('exit');
    expect(JSON.parse(captured)).not.toHaveProperty('code');
  });

  it('merges extra fields into output', () => {
    expect(() => jsonError('fail', 'ERR', { detail: 'more info', count: 3 })).toThrow('exit');
    const parsed = JSON.parse(captured);
    expect(parsed.error).toBe('fail');
    expect(parsed.code).toBe('ERR');
    expect(parsed.detail).toBe('more info');
    expect(parsed.count).toBe(3);
  });

  it('exits with code 1', () => {
    expect(() => jsonError('fail')).toThrow('exit');
    expect(exitCode).toBe(1);
  });
});
