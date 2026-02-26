import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { installMcpConfig, uninstallMcpConfig } from '../mcp.js';

const TMP = join(tmpdir(), `opentil-test-mcp-${process.pid}`);

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('installMcpConfig', () => {
  it('creates HTTP config when token is provided', () => {
    const configPath = join(TMP, 'mcp.json');
    installMcpConfig(configPath, 'til_abc123');
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.opentil).toEqual({
      type: 'http',
      url: 'https://opentil.ai/mcp',
      headers: { Authorization: 'Bearer til_abc123' },
    });
  });

  it('creates stdio config when no token', () => {
    const configPath = join(TMP, 'mcp.json');
    installMcpConfig(configPath);
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.opentil.command).toBe('npx');
    expect(config.mcpServers.opentil.args).toContain('@opentil/mcp');
  });

  it('preserves other mcpServers entries', () => {
    const configPath = join(TMP, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        other: { command: 'node', args: ['server.js'] },
      },
    }));
    installMcpConfig(configPath, 'til_abc');
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.other).toEqual({ command: 'node', args: ['server.js'] });
    expect(config.mcpServers.opentil).toBeTruthy();
  });

  it('creates file when it does not exist', () => {
    const configPath = join(TMP, 'sub', 'mcp.json');
    installMcpConfig(configPath, 'til_token');
    expect(existsSync(configPath)).toBe(true);
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.opentil.type).toBe('http');
  });
});

describe('uninstallMcpConfig', () => {
  it('removes only opentil entry', () => {
    const configPath = join(TMP, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        opentil: { type: 'http', url: 'https://opentil.ai/mcp' },
        other: { command: 'node', args: ['a.js'] },
      },
    }));
    uninstallMcpConfig(configPath);
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.opentil).toBeUndefined();
    expect(config.mcpServers.other).toBeTruthy();
  });

  it('removes mcpServers key when empty', () => {
    const configPath = join(TMP, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        opentil: { type: 'http', url: 'https://opentil.ai/mcp' },
      },
    }));
    uninstallMcpConfig(configPath);
    const config = readJson(configPath);
    expect(config.mcpServers).toBeUndefined();
  });

  it('no-ops when file does not exist', () => {
    // Should not throw
    uninstallMcpConfig(join(TMP, 'nonexistent.json'));
  });

  it('no-ops when opentil entry missing', () => {
    const configPath = join(TMP, 'mcp.json');
    writeFileSync(configPath, JSON.stringify({
      mcpServers: { other: { command: 'node', args: [] } },
    }));
    uninstallMcpConfig(configPath);
    const config = readJson(configPath) as { mcpServers: Record<string, any> };
    expect(config.mcpServers.other).toBeTruthy();
  });
});
