import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Manifest } from '../manifest.js';
import type { ExtraType } from '../agents/registry.js';

// ─── Capture helpers ────────────────────────────────────────────────

class JsonOutputCapture extends Error {
  constructor(public data: Record<string, unknown>) {
    super('jsonOutput');
  }
}

// ─── Mock state ─────────────────────────────────────────────────────

let currentManifest: Manifest | null = null;
let latestVersionResult: { latest: string; current: string; isOutdated: boolean } | null = null;
let existsSyncPaths: Set<string> = new Set();
let mockCreds: { token: string; host: string; source: string } | null = null;
let mockValidateResult: { status: string; username?: string } = { status: 'valid', username: 'testuser' };

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../json-mode.js', () => ({
  isJsonMode: () => true,
  jsonOutput: (data: Record<string, unknown>) => {
    throw new JsonOutputCapture(data);
  },
}));

vi.mock('../manifest.js', () => ({
  readManifest: () => currentManifest,
}));

vi.mock('../version.js', () => ({
  getVersion: () => '1.5.0',
  checkLatestVersion: async () => latestVersionResult,
}));

vi.mock('../auth.js', () => ({
  readExistingCredentials: () => mockCreds,
  validateToken: async () => mockValidateResult,
}));

vi.mock('../agents/registry.js', () => ({
  agents: {
    'claude-code': {
      name: 'claude-code',
      displayName: 'Claude Code',
      detect: () => true,
      globalSkillDir: '/mock/.claude/skills',
      extras: ['hooks', 'agent-md'] as ExtraType[],
      agentMdPath: '/mock/.claude/CLAUDE.md',
      mcpConfigPath: '/mock/.claude.json',
    },
    cursor: {
      name: 'cursor',
      displayName: 'Cursor',
      detect: () => false,
      globalSkillDir: '/mock/.cursor/skills',
      extras: [] as ExtraType[],
      mcpConfigPath: '/mock/.cursor/mcp.json',
    },
  },
}));

vi.mock('node:fs', () => ({
  existsSync: (p: string) => existsSyncPaths.has(p),
}));

vi.mock('../utils.js', () => ({
  home: '/mock',
  readJsonFile: () => null,
  readTextFile: () => null,
}));

// Import after mocks
const { doctor } = await import('../commands/doctor.js');

// ─── Helpers ────────────────────────────────────────────────────────

function makeFlags() {
  return { command: 'doctor', json: true, positionals: ['doctor'] };
}

function makeManifest(agentEntries: Record<string, { extras: ExtraType[]; mcp?: boolean }>): Manifest {
  const agents: Manifest['agents'] = {};
  for (const [id, entry] of Object.entries(agentEntries)) {
    agents[id] = { skill: true, extras: entry.extras, mcp: entry.mcp };
  }
  return {
    version: '1.0.0',
    installedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    agents,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  currentManifest = null;
  latestVersionResult = null;
  existsSyncPaths = new Set();
  mockCreds = null;
  mockValidateResult = { status: 'valid', username: 'testuser' };
});

describe('doctor --json', () => {
  // ── No manifest branch ──

  it('outputs installed: false when no manifest exists', async () => {
    currentManifest = null;
    try {
      await doctor(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.installed).toBe(false);
      expect(data.version).toBe('1.5.0');
    }
  });

  it('does not include agents or auth when no manifest', async () => {
    currentManifest = null;
    try {
      await doctor(makeFlags());
    } catch (e) {
      const data = (e as JsonOutputCapture).data;
      expect(data).not.toHaveProperty('agents');
      expect(data).not.toHaveProperty('auth');
    }
  });

  // ── With manifest ──

  it('outputs installed: true with version info', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    latestVersionResult = { latest: '2.0.0', current: '1.5.0', isOutdated: true };
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const data = (e as JsonOutputCapture).data;
      expect(data.installed).toBe(true);
      expect(data.version).toBe('1.5.0');
      expect(data.latest).toBe('2.0.0');
      expect(data.outdated).toBe(true);
    }
  });

  it('falls back to current version when checkLatestVersion returns null', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    latestVersionResult = null;
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const data = (e as JsonOutputCapture).data;
      expect(data.latest).toBe('1.5.0'); // fallback to getVersion()
      expect(data.outdated).toBe(false);
    }
  });

  // ── Agent checks ──

  it('includes agent detected/skill/extras/mcp fields', async () => {
    currentManifest = makeManifest({
      'claude-code': { extras: ['hooks'], mcp: true },
    });
    existsSyncPaths.add('/mock/.claude/skills/til/SKILL.md');
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const data = (e as JsonOutputCapture).data;
      const agents = data.agents as Record<string, Record<string, unknown>>;
      const cc = agents['claude-code'];
      expect(cc.detected).toBe(true);
      expect(cc.skill).toBe(true);
      expect(cc.skillVersion).toBe('1.0.0'); // manifest version
      expect(cc.extras).toEqual(['hooks']);
      expect(cc.mcp).toBe(true);
    }
  });

  it('reports skill: false when SKILL.md does not exist', async () => {
    currentManifest = makeManifest({
      'claude-code': { extras: [] },
    });
    // No path in existsSyncPaths
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Record<string, Record<string, unknown>>;
      expect(agents['claude-code'].skill).toBe(false);
    }
  });

  it('reports unknown agent with error message', async () => {
    currentManifest = makeManifest({
      'nonexistent-agent': { extras: [] },
    });
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Record<string, Record<string, unknown>>;
      expect(agents['nonexistent-agent']).toEqual({
        detected: false,
        error: 'Unknown agent',
      });
    }
  });

  it('defaults mcp to false when not set in manifest', async () => {
    currentManifest = makeManifest({
      'claude-code': { extras: [] },
    });
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Record<string, Record<string, unknown>>;
      expect(agents['claude-code'].mcp).toBe(false);
    }
  });

  // ── Auth checks ──

  it('reports auth status none when no credentials', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    mockCreds = null;

    try {
      await doctor(makeFlags());
    } catch (e) {
      const data = (e as JsonOutputCapture).data;
      expect(data.auth).toEqual({ status: 'none' });
    }
  });

  it('reports authenticated status with username', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    mockCreds = { token: 'tok', host: 'https://api.opentil.com', source: 'file' };
    mockValidateResult = { status: 'valid', username: 'alice' };

    try {
      await doctor(makeFlags());
    } catch (e) {
      const auth = (e as JsonOutputCapture).data.auth as Record<string, unknown>;
      expect(auth.status).toBe('authenticated');
      expect(auth.username).toBe('alice');
      expect(auth.source).toBe('file');
    }
  });

  it('reports expired status', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    mockCreds = { token: 'old-tok', host: 'https://api.opentil.com', source: 'env' };
    mockValidateResult = { status: 'expired' };

    try {
      await doctor(makeFlags());
    } catch (e) {
      const auth = (e as JsonOutputCapture).data.auth as Record<string, unknown>;
      expect(auth.status).toBe('expired');
      expect(auth.source).toBe('env');
    }
  });

  it('reports network_error status', async () => {
    currentManifest = makeManifest({ 'claude-code': { extras: [] } });
    mockCreds = { token: 'tok', host: 'https://api.opentil.com', source: 'file' };
    mockValidateResult = { status: 'network_error' };

    try {
      await doctor(makeFlags());
    } catch (e) {
      const auth = (e as JsonOutputCapture).data.auth as Record<string, unknown>;
      expect(auth.status).toBe('network_error');
      expect(auth.source).toBe('file');
    }
  });
});
