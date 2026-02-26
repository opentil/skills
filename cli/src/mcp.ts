import { readJsonFile, writeJsonFile } from './utils.js';

// --- Config types ---

interface StdioServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface HttpServerEntry {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

type McpServerEntry = StdioServerEntry | HttpServerEntry;

interface McpConfigFile {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

// --- Constants ---

const MCP_SERVER_KEY = 'opentil';
const MCP_HTTP_URL = 'https://opentil.ai/mcp';

// Remote HTTP config (recommended — zero install)
function httpConfig(token: string): HttpServerEntry {
  return {
    type: 'http',
    url: MCP_HTTP_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

// Local stdio config (fallback — requires Node.js)
function stdioConfig(): StdioServerEntry {
  return {
    command: 'npx',
    args: ['-y', '@opentil/mcp'],
    env: {},
  };
}

// --- Public API ---

export function installMcpConfig(configPath: string, token?: string): void {
  const config = readJsonFile<McpConfigFile>(configPath) ?? {};
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  config.mcpServers[MCP_SERVER_KEY] = token ? httpConfig(token) : stdioConfig();
  writeJsonFile(configPath, config);
}

export function uninstallMcpConfig(configPath: string): void {
  const config = readJsonFile<McpConfigFile>(configPath);
  if (!config?.mcpServers?.[MCP_SERVER_KEY]) return;

  delete config.mcpServers[MCP_SERVER_KEY];

  // Clean up empty mcpServers object
  if (Object.keys(config.mcpServers).length === 0) {
    delete config.mcpServers;
  }

  writeJsonFile(configPath, config);
}
