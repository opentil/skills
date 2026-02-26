import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock utils to redirect file operations to temp dir
const TMP = join(tmpdir(), `opentil-test-manifest-${process.pid}`);
const MANIFEST_PATH = join(TMP, '.til', 'manifest.json');

vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils.js')>();
  return {
    ...actual,
    home: TMP,
  };
});

// Import after mock
const { readManifest, writeManifest, createManifest, updateManifest } = await import('../manifest.js');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, '.til'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createManifest', () => {
  it('creates manifest with version and timestamps', () => {
    const m = createManifest('1.0.0');
    expect(m.version).toBe('1.0.0');
    expect(m.installedAt).toBeTruthy();
    expect(m.updatedAt).toBeTruthy();
    expect(m.agents).toEqual({});
  });
});

describe('updateManifest', () => {
  it('preserves agents data and updates version/timestamp', () => {
    const original = createManifest('1.0.0');
    original.agents = { 'claude-code': { skill: true, extras: ['hooks'] } };

    const updated = updateManifest(original, '1.1.0');
    expect(updated.version).toBe('1.1.0');
    expect(updated.agents['claude-code']).toEqual({ skill: true, extras: ['hooks'] });
    expect(updated.installedAt).toBe(original.installedAt);
  });
});

describe('readManifest', () => {
  it('returns null when file does not exist', () => {
    expect(readManifest()).toBeNull();
  });

  it('reads existing manifest', () => {
    const m = createManifest('1.0.0');
    writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
    const read = readManifest();
    expect(read).not.toBeNull();
    expect(read!.version).toBe('1.0.0');
  });

  it('returns null for malformed JSON', () => {
    writeFileSync(MANIFEST_PATH, 'not json');
    expect(readManifest()).toBeNull();
  });
});

describe('writeManifest', () => {
  it('writes manifest to disk', () => {
    const m = createManifest('1.0.0');
    m.agents = { cursor: { skill: true, extras: [] } };
    writeManifest(m);

    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(raw.version).toBe('1.0.0');
    expect(raw.agents.cursor.skill).toBe(true);
  });
});
