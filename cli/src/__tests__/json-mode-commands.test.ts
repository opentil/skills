import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Manifest } from '../manifest.js';
import type { ExtraType } from '../agents/registry.js';

// ─── Capture helpers ────────────────────────────────────────────────

class JsonOutputCapture extends Error {
  constructor(public data: Record<string, unknown>) {
    super('jsonOutput');
  }
}

class JsonErrorCapture extends Error {
  constructor(
    public errorMessage: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super('jsonError');
  }
}

// ─── Mocks ──────────────────────────────────────────────────────────

// Track manifest writes
let writtenManifest: Manifest | null = null;
let manifestRemoved = false;
let currentManifest: Manifest | null = null;

vi.mock('../json-mode.js', () => ({
  isJsonMode: () => true,
  jsonOutput: (data: Record<string, unknown>) => {
    throw new JsonOutputCapture(data);
  },
  jsonError: (message: string, code?: string, extra?: Record<string, unknown>) => {
    throw new JsonErrorCapture(message, code, extra);
  },
}));

vi.mock('../manifest.js', () => ({
  readManifest: () => currentManifest,
  writeManifest: (m: Manifest) => {
    writtenManifest = structuredClone(m);
  },
  removeManifest: () => {
    manifestRemoved = true;
  },
  createManifest: (version: string) => ({
    version,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agents: {},
  }),
  updateManifest: (manifest: Manifest, version: string) => ({
    ...manifest,
    version,
    updatedAt: new Date().toISOString(),
  }),
}));

vi.mock('../utils.js', () => ({
  home: '/tmp/test-home',
  removeDir: vi.fn(),
  pruneEmptyParents: vi.fn(),
}));

vi.mock('../skill-content.js', () => ({
  installSkillFiles: vi.fn(),
}));

vi.mock('../agents/agent-md.js', () => ({
  installAgentMdSection: vi.fn(),
  uninstallAgentMdSection: vi.fn(),
}));

vi.mock('../agents/claude-code.js', () => ({
  installClaudeCodeHooks: vi.fn(),
  uninstallClaudeCodeHooks: vi.fn(),
}));

vi.mock('../mcp.js', () => ({
  installMcpConfig: vi.fn(),
  uninstallMcpConfig: vi.fn(),
}));

vi.mock('../version.js', () => ({
  getVersion: () => '1.0.0',
  checkLatestVersion: async () => null,
}));

vi.mock('../auth.js', () => ({
  readExistingCredentials: () => null,
  runAuthPhase: async () => ({ authenticated: false }),
  validateToken: async () => ({ status: 'valid' }),
}));

vi.mock('../agents/detect.js', () => ({
  detectAgents: () => [
    {
      id: 'claude-code',
      config: {
        name: 'claude-code',
        displayName: 'Claude Code',
        detect: () => true,
        globalSkillDir: '/tmp/test-home/.claude/skills',
        extras: ['hooks', 'agent-md'] as ExtraType[],
        agentMdPath: '/tmp/test-home/.claude/CLAUDE.md',
        mcpConfigPath: '/tmp/test-home/.claude.json',
      },
      installed: true,
    },
    {
      id: 'cursor',
      config: {
        name: 'cursor',
        displayName: 'Cursor',
        detect: () => true,
        globalSkillDir: '/tmp/test-home/.cursor/skills',
        extras: [] as ExtraType[],
        mcpConfigPath: '/tmp/test-home/.cursor/mcp.json',
      },
      installed: true,
    },
  ],
  cleanupInstallerDirs: () => [],
}));

// Import after mocks
const { uninstall } = await import('../commands/uninstall.js');
const { update } = await import('../commands/update.js');
const { install } = await import('../commands/install.js');

// ─── Helpers ────────────────────────────────────────────────────────

function makeFlags(overrides: Record<string, unknown> = {}) {
  return {
    command: undefined,
    json: true,
    positionals: [],
    ...overrides,
  };
}

function makeManifest(agentIds: string[]): Manifest {
  const agents: Manifest['agents'] = {};
  for (const id of agentIds) {
    agents[id] = { skill: true, extras: [] };
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
  writtenManifest = null;
  manifestRemoved = false;
  currentManifest = null;
});

describe('uninstall --json', () => {
  it('removes manifest entirely when all agents uninstalled', async () => {
    currentManifest = makeManifest(['claude-code']);
    try {
      await uninstall(makeFlags({ agent: 'claude-code' }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
    }
    expect(manifestRemoved).toBe(true);
    expect(writtenManifest).toBeNull();
  });

  it('updates manifest (not removes) when uninstalling one of multiple agents', async () => {
    currentManifest = makeManifest(['claude-code', 'cursor']);
    try {
      await uninstall(makeFlags({ agent: 'claude-code' }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
      expect(data.removed).toEqual([{ id: 'claude-code', name: 'Claude Code' }]);
    }
    // Manifest should be written back with only cursor remaining
    expect(manifestRemoved).toBe(false);
    expect(writtenManifest).not.toBeNull();
    expect(writtenManifest!.agents).not.toHaveProperty('claude-code');
    expect(writtenManifest!.agents).toHaveProperty('cursor');
  });

  it('errors when agent is not installed', async () => {
    currentManifest = makeManifest(['cursor']);
    try {
      await uninstall(makeFlags({ agent: 'claude-code' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('NOT_INSTALLED');
    }
  });

  it('succeeds with message when no manifest exists', async () => {
    currentManifest = null;
    try {
      await uninstall(makeFlags({}));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
      expect(data.message).toBeDefined();
    }
  });

  it('--agent all behaves same as no agent (uninstalls all)', async () => {
    currentManifest = makeManifest(['claude-code', 'cursor']);
    try {
      await uninstall(makeFlags({ agent: 'all' }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
      const removed = data.removed as Array<Record<string, unknown>>;
      expect(removed).toHaveLength(2);
    }
    expect(manifestRemoved).toBe(true);
  });
});

describe('update --json', () => {
  it('rejects agent not in manifest with NOT_INSTALLED', async () => {
    currentManifest = makeManifest(['cursor']);
    try {
      await update(makeFlags({ agent: 'claude-code' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      const err = e as JsonErrorCapture;
      expect(err.code).toBe('NOT_INSTALLED');
      expect(err.extra?.installed).toEqual(['cursor']);
    }
  });

  it('rejects unknown agent with UNKNOWN_AGENT', async () => {
    currentManifest = makeManifest(['cursor']);
    try {
      await update(makeFlags({ agent: 'nonexistent' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('UNKNOWN_AGENT');
    }
  });

  it('succeeds for an installed agent', async () => {
    currentManifest = makeManifest(['cursor']);
    try {
      await update(makeFlags({ agent: 'cursor' }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.agents).toEqual(['cursor']);
    }
  });

  it('errors with NOT_INSTALLED when no manifest', async () => {
    currentManifest = null;
    try {
      await update(makeFlags({}));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      expect((e as JsonErrorCapture).code).toBe('NOT_INSTALLED');
    }
  });

  it('updates all manifest agents when no --agent specified', async () => {
    currentManifest = makeManifest(['claude-code', 'cursor']);
    try {
      await update(makeFlags({}));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.agents).toEqual(['claude-code', 'cursor']);
    }
  });

  it('output contains from/to/updated/changes fields', async () => {
    currentManifest = makeManifest(['cursor']);
    try {
      await update(makeFlags({ agent: 'cursor' }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data).toHaveProperty('from');
      expect(data).toHaveProperty('to');
      expect(data).toHaveProperty('updated');
      expect(data).toHaveProperty('changes');
      expect(Array.isArray(data.changes)).toBe(true);
    }
  });
});

describe('install --json', () => {
  it('rejects invalid extras with INVALID_EXTRAS', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'claude-code', extras: 'hooks,typo' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      const err = e as JsonErrorCapture;
      expect(err.code).toBe('INVALID_EXTRAS');
      expect(err.extra?.invalid).toEqual(['typo']);
      expect(err.extra?.available).toEqual(['hooks', 'agent-md']);
    }
  });

  it('accepts valid extras without error', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'claude-code', extras: 'hooks', skipAuth: true }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
    }
  });

  it('accepts empty extras for agent with no supported extras', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'cursor', extras: 'hooks' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      const err = e as JsonErrorCapture;
      expect(err.code).toBe('INVALID_EXTRAS');
      expect(err.extra?.invalid).toEqual(['hooks']);
      expect(err.extra?.available).toEqual([]);
    }
  });

  it('errors when --agent is missing', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({}));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      const err = e as JsonErrorCapture;
      expect(err.code).toBe('MISSING_AGENT');
      expect(err.extra?.available).toBeDefined();
    }
  });

  it('errors with UNKNOWN_AGENT for unrecognized agent name', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'nonexistent' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonErrorCapture);
      const err = e as JsonErrorCapture;
      expect(err.code).toBe('UNKNOWN_AGENT');
    }
  });

  it('--skip-auth sets auth.status to skipped', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'claude-code', skipAuth: true }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
      const auth = data.auth as Record<string, unknown>;
      expect(auth.status).toBe('skipped');
    }
  });

  it('preserves other agents in manifest when installing single agent', async () => {
    currentManifest = makeManifest(['cursor']);
    // Add extras to cursor entry so we can verify it's preserved
    currentManifest.agents['cursor'] = { skill: true, extras: [], mcp: true };
    try {
      await install(makeFlags({ agent: 'claude-code', skipAuth: true }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
    }
    // cursor should still be in manifest
    expect(writtenManifest).not.toBeNull();
    expect(writtenManifest!.agents).toHaveProperty('cursor');
    expect(writtenManifest!.agents.cursor.mcp).toBe(true);
    // claude-code should also be present
    expect(writtenManifest!.agents).toHaveProperty('claude-code');
  });

  it('happy path output contains expected structure', async () => {
    currentManifest = null;
    try {
      await install(makeFlags({ agent: 'claude-code', skipAuth: true }));
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.success).toBe(true);
      expect(data.version).toBe('1.0.0');
      expect(Array.isArray(data.agents)).toBe(true);
      const agents = data.agents as Array<Record<string, unknown>>;
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0]).toHaveProperty('id');
      expect(agents[0]).toHaveProperty('name');
      expect(agents[0]).toHaveProperty('skillDir');
      expect(agents[0]).toHaveProperty('extras');
      expect(data.auth).toBeDefined();
    }
  });
});
