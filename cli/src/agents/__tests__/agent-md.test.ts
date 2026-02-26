import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { installAgentMdSection, uninstallAgentMdSection } from '../agent-md.js';

const TMP = join(tmpdir(), `opentil-test-agentmd-${process.pid}`);

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

describe('installAgentMdSection', () => {
  it('creates new file with section when file does not exist', () => {
    const file = join(TMP, 'CLAUDE.md');
    installAgentMdSection(file);
    const content = read(file);
    expect(content).toContain('<!-- opentil:start -->');
    expect(content).toContain('<!-- opentil:end -->');
    expect(content).toContain('/til');
  });

  it('replaces existing section', () => {
    const file = join(TMP, 'CLAUDE.md');
    writeFileSync(file, '# My Config\n\n<!-- opentil:start -->\nold content\n<!-- opentil:end -->\n\n# Other');
    installAgentMdSection(file);
    const content = read(file);
    expect(content).toContain('<!-- opentil:start -->');
    expect(content).toContain('<!-- opentil:end -->');
    expect(content).not.toContain('old content');
    expect(content).toContain('# Other');
    expect(content).toContain('# My Config');
  });

  it('appends to existing file without section', () => {
    const file = join(TMP, 'CLAUDE.md');
    writeFileSync(file, '# Existing content\n');
    installAgentMdSection(file);
    const content = read(file);
    expect(content).toContain('# Existing content');
    expect(content).toContain('<!-- opentil:start -->');
  });

  it('replaces /til with custom command prefix', () => {
    const file = join(TMP, 'AGENTS.md');
    installAgentMdSection(file, '$til');
    const content = read(file);
    expect(content).toContain('$til');
    expect(content).not.toMatch(/\/til(?=[^a-zA-Z0-9_]|$)/);
  });

  it('does not replace /til when prefix is default', () => {
    const file = join(TMP, 'CLAUDE.md');
    installAgentMdSection(file, '/til');
    const content = read(file);
    expect(content).toContain('/til');
  });
});

describe('uninstallAgentMdSection', () => {
  it('removes section from file', () => {
    const file = join(TMP, 'CLAUDE.md');
    writeFileSync(file, '# Config\n\n<!-- opentil:start -->\nstuff\n<!-- opentil:end -->\n\n# Other\n');
    uninstallAgentMdSection(file);
    const content = read(file);
    expect(content).not.toContain('<!-- opentil:start -->');
    expect(content).toContain('# Config');
    expect(content).toContain('# Other');
  });

  it('deletes file when section is the only content', () => {
    const file = join(TMP, 'CLAUDE.md');
    writeFileSync(file, '<!-- opentil:start -->\nstuff\n<!-- opentil:end -->');
    uninstallAgentMdSection(file);
    expect(existsSync(file)).toBe(false);
  });

  it('no-ops when file does not exist', () => {
    const file = join(TMP, 'nope.md');
    // Should not throw
    uninstallAgentMdSection(file);
  });

  it('no-ops when file has no section', () => {
    const file = join(TMP, 'CLAUDE.md');
    writeFileSync(file, '# Just regular content\n');
    uninstallAgentMdSection(file);
    expect(read(file)).toBe('# Just regular content\n');
  });
});
