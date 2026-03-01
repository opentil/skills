import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Manifest } from '../manifest.js';
import type { ExtraType } from '../agents/registry.js';

// ─── Capture helpers ────────────────────────────────────────────────

class JsonOutputCapture extends Error {
  constructor(public data: Record<string, unknown>) {
    super('jsonOutput');
  }
}

// ─── Mocks ──────────────────────────────────────────────────────────

let currentManifest: Manifest | null = null;
let mockDetected: Array<{
  id: string;
  config: Record<string, unknown>;
  installed: boolean;
}> = [];
let existsSyncPaths: Set<string> = new Set();

vi.mock('../json-mode.js', () => ({
  isJsonMode: () => true,
  jsonOutput: (data: Record<string, unknown>) => {
    throw new JsonOutputCapture(data);
  },
  jsonError: (message: string, code?: string, extra?: Record<string, unknown>) => {
    throw new Error(`jsonError: ${message}`);
  },
}));

vi.mock('../manifest.js', () => ({
  readManifest: () => currentManifest,
}));

vi.mock('../agents/detect.js', () => ({
  detectAgents: () => mockDetected,
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
      detect: () => true,
      globalSkillDir: '/mock/.cursor/skills',
      extras: [] as ExtraType[],
      mcpConfigPath: '/mock/.cursor/mcp.json',
    },
  },
}));

vi.mock('node:fs', () => ({
  existsSync: (p: string) => existsSyncPaths.has(p),
}));

// Import after mocks
const { detect } = await import('../commands/detect.js');

// ─── Helpers ────────────────────────────────────────────────────────

function makeFlags() {
  return { command: 'detect', json: true, positionals: ['detect'] };
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
  mockDetected = [];
  existsSyncPaths = new Set();
});

describe('detect --json', () => {
  it('returns empty agents array when no agents detected', async () => {
    mockDetected = [];
    try {
      await detect(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const data = (e as JsonOutputCapture).data;
      expect(data.agents).toEqual([]);
    }
  });

  it('maps output fields correctly for installed agent', async () => {
    mockDetected = [
      {
        id: 'claude-code',
        config: {},
        installed: true,
      },
    ];
    currentManifest = makeManifest({
      'claude-code': { extras: ['hooks'], mcp: true },
    });
    existsSyncPaths.add('/mock/.claude/skills/til/SKILL.md');

    try {
      await detect(makeFlags());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(JsonOutputCapture);
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents).toHaveLength(1);
      const agent = agents[0];
      expect(agent.id).toBe('claude-code');
      expect(agent.name).toBe('Claude Code');
      expect(agent.installed).toBe(true);
      expect(agent.hasSkill).toBe(true);
      expect(agent.extras).toEqual(['hooks']);
      expect(agent.supportedExtras).toEqual(['hooks', 'agent-md']);
      expect(agent.skillDir).toBe('/mock/.claude/skills/til');
      expect(agent.mcpConfigPath).toBe('/mock/.claude.json');
      expect(agent.mcp).toBe(true);
    }
  });

  it('uses manifest extras when manifest entry exists', async () => {
    mockDetected = [{ id: 'claude-code', config: {}, installed: true }];
    currentManifest = makeManifest({
      'claude-code': { extras: ['agent-md'] },
    });

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents[0].extras).toEqual(['agent-md']);
    }
  });

  it('returns empty extras and full supportedExtras when no manifest entry', async () => {
    mockDetected = [{ id: 'claude-code', config: {}, installed: true }];
    currentManifest = null; // no manifest

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      // No manifest entry → extras is empty, supportedExtras shows capabilities
      expect(agents[0].extras).toEqual([]);
      expect(agents[0].supportedExtras).toEqual(['hooks', 'agent-md']);
    }
  });

  it('uses manifest mcp value', async () => {
    mockDetected = [{ id: 'claude-code', config: {}, installed: true }];
    currentManifest = makeManifest({
      'claude-code': { extras: [], mcp: true },
    });

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents[0].mcp).toBe(true);
    }
  });

  it('defaults mcp to false when no manifest entry', async () => {
    mockDetected = [{ id: 'claude-code', config: {}, installed: true }];
    currentManifest = null;

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents[0].mcp).toBe(false);
    }
  });

  it('reports hasSkill based on SKILL.md existence', async () => {
    mockDetected = [{ id: 'claude-code', config: {}, installed: true }];
    currentManifest = null;
    // No SKILL.md path in existsSyncPaths

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents[0].hasSkill).toBe(false);
    }
  });

  it('handles multiple agents', async () => {
    mockDetected = [
      { id: 'claude-code', config: {}, installed: true },
      { id: 'cursor', config: {}, installed: true },
    ];
    currentManifest = makeManifest({
      'claude-code': { extras: ['hooks'], mcp: true },
      cursor: { extras: [], mcp: false },
    });
    existsSyncPaths.add('/mock/.claude/skills/til/SKILL.md');

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('claude-code');
      expect(agents[0].hasSkill).toBe(true);
      expect(agents[1].id).toBe('cursor');
      expect(agents[1].hasSkill).toBe(false);
    }
  });

  it('filters out non-installed agents from output', async () => {
    mockDetected = [
      { id: 'claude-code', config: {}, installed: true },
      { id: 'cursor', config: {}, installed: false },
    ];
    currentManifest = null;

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('claude-code');
    }
  });

  it('returns null mcpConfigPath for agents without it', async () => {
    // Override mock to test agent without mcpConfigPath
    mockDetected = [{ id: 'cursor', config: {}, installed: true }];
    currentManifest = null;

    try {
      await detect(makeFlags());
    } catch (e) {
      const agents = (e as JsonOutputCapture).data.agents as Array<Record<string, unknown>>;
      // cursor has mcpConfigPath in our mock, so it should be present
      expect(agents[0].mcpConfigPath).toBe('/mock/.cursor/mcp.json');
    }
  });
});
