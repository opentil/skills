import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isInstallerOnlyDir } from '../detect.js';

const TMP = join(tmpdir(), `opentil-test-detect-${process.pid}`);

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('isInstallerOnlyDir', () => {
  it('returns true for non-existent directory', () => {
    expect(isInstallerOnlyDir(join(TMP, 'nope'))).toBe(true);
  });

  it('returns true for empty directory', () => {
    const dir = join(TMP, 'empty');
    mkdirSync(dir);
    expect(isInstallerOnlyDir(dir)).toBe(true);
  });

  it('returns true for directory containing only skills/', () => {
    const dir = join(TMP, 'only-skills');
    mkdirSync(join(dir, 'skills'), { recursive: true });
    expect(isInstallerOnlyDir(dir)).toBe(true);
  });

  it('returns true for nested installer-only directories', () => {
    const dir = join(TMP, 'nested');
    mkdirSync(join(dir, 'sub', 'skills'), { recursive: true });
    expect(isInstallerOnlyDir(dir)).toBe(true);
  });

  it('returns false when real files exist', () => {
    const dir = join(TMP, 'has-file');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{}');
    expect(isInstallerOnlyDir(dir)).toBe(false);
  });

  it('returns false when non-skills directory has files', () => {
    const dir = join(TMP, 'mixed');
    mkdirSync(join(dir, 'skills'), { recursive: true });
    mkdirSync(join(dir, 'other'), { recursive: true });
    writeFileSync(join(dir, 'other', 'readme.md'), 'hello');
    expect(isInstallerOnlyDir(dir)).toBe(false);
  });
});
