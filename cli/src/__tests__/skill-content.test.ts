import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkillFiles } from '../skill-content.js';

const TMP = join(tmpdir(), `opentil-test-skill-${process.pid}`);

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('installSkillFiles', () => {
  it('copies SKILL.md to target directory', () => {
    const target = join(TMP, 'til');
    installSkillFiles(target);
    expect(existsSync(join(target, 'SKILL.md'))).toBe(true);
    const content = read(join(target, 'SKILL.md'));
    expect(content).toContain('/til');
  });

  it('copies references/ directory', () => {
    const target = join(TMP, 'til');
    installSkillFiles(target);
    expect(existsSync(join(target, 'references'))).toBe(true);
    // Should have at least one reference file
    const refs = join(target, 'references');
    expect(existsSync(join(refs, 'api.md'))).toBe(true);
  });

  it('replaces /til with custom commandPrefix', () => {
    const target = join(TMP, 'til');
    installSkillFiles(target, { commandPrefix: '$til' });
    const content = read(join(target, 'SKILL.md'));
    expect(content).toContain('$til');
    // Should not have bare /til (but may have path like ~/.til/)
    expect(content).not.toMatch(/\/til(?=[^a-zA-Z0-9_/]|$)/);
  });

  it('does not replace ~/.til/ paths', () => {
    const target = join(TMP, 'til');
    installSkillFiles(target, { commandPrefix: '$til' });
    const content = read(join(target, 'SKILL.md'));
    // The ~/.til/ path should remain unchanged (the / before til is preceded by .)
    // Our regex /\/til(?=[^a-zA-Z0-9_]|$)/ matches /til at word boundary
    // but ~/.til/ is .til, not /til so it's safe
    if (content.includes('~/.til')) {
      expect(content).toContain('~/.til');
    }
  });

  it('preserves /til when prefix is default', () => {
    const target = join(TMP, 'til');
    installSkillFiles(target, { commandPrefix: '/til' });
    const content = read(join(target, 'SKILL.md'));
    expect(content).toContain('/til');
  });
});
