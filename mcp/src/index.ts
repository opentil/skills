import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { resolveConfig } from './config.js';
import { ApiClient } from './api-client.js';
import { getProfile } from './tools/get-profile.js';
import { getRecentLearnings } from './tools/get-recent-learnings.js';
import { searchKnowledge } from './tools/search-knowledge.js';
import { getEntry } from './tools/get-entry.js';
import { createTil } from './tools/create-til.js';
import { listCategories } from './tools/list-categories.js';

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, rel), 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return '0.0.0';
}

const NO_TOKEN_MESSAGE = [
  'No OpenTIL token found.',
  '',
  'Set up authentication in one of two ways:',
  '1. Environment variable: export OPENTIL_TOKEN=til_xxx',
  '2. Credentials file: run the /til auth command in your AI agent',
  '',
  'Create a token at: https://opentil.ai/dashboard/settings/tokens',
].join('\n');

function createApi(): ApiClient | null {
  const config = resolveConfig();
  if (!config) return null;
  return new ApiClient(config);
}

const server = new McpServer(
  { name: 'opentil', version: getVersion() },
  {
    instructions: [
      'OpenTIL is your personal TIL (Today I Learned) knowledge base.',
      '',
      'For WRITING (create, update, delete): Prefer the TIL skill command when available — it provides content enrichment (auto-generates titles, tags, summaries), user confirmation before publishing, and local fallback on failure. Use write tools only when the TIL skill is not available.',
      '',
      'For READING & SEARCHING: Use get_profile, get_recent_learnings, search_knowledge, get_entry, and list_categories freely.',
    ].join('\n'),
  },
);

// 1. get_profile — Understand the user's technical background
server.tool(
  'get_profile',
  "Get the user's OpenTIL profile: username, top tags, total entries, and site info",
  {},
  { readOnlyHint: true },
  async () => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await getProfile(api);
    return { content: [{ type: 'text' as const, text }] };
  },
);

// 2. get_recent_learnings — Understand what the user has been learning recently
server.tool(
  'get_recent_learnings',
  "Get the user's most recent TIL entries to understand their current focus areas",
  {
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe('Number of recent entries to fetch (1-20)'),
  },
  { readOnlyHint: true },
  async ({ limit }) => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await getRecentLearnings(api, limit);
    return { content: [{ type: 'text' as const, text }] };
  },
);

// 3. search_knowledge — Core: search the user's knowledge base
server.tool(
  'search_knowledge',
  "Search the user's TIL knowledge base by keyword. Searches across titles, content, tags, and categories.",
  {
    query: z.string().describe('Search query (searches titles, content, tags, categories)'),
    tag: z
      .string()
      .optional()
      .describe('Filter by tag slug (optional)'),
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe('Max results to return (1-20)'),
  },
  { readOnlyHint: true },
  async ({ query, tag, limit }) => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await searchKnowledge(api, query, tag, limit);
    return { content: [{ type: 'text' as const, text }] };
  },
);

// 4. get_entry — Read the full content of a specific entry
server.tool(
  'get_entry',
  'Get the full content of a specific TIL entry by its ID',
  {
    id: z.string().min(1).describe('Entry ID'),
  },
  { readOnlyHint: true },
  async ({ id }) => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await getEntry(api, id);
    return { content: [{ type: 'text' as const, text }] };
  },
);

// 5. create_til — Record a new learning
server.tool(
  'create_til',
  'Create a new TIL entry. NOTE: Prefer the TIL skill command when available — it provides richer content enrichment and user confirmation. Use this tool only as a fallback when the TIL skill is not installed.',
  {
    title: z.string().describe('Entry title'),
    content: z.string().describe('Entry content in Markdown'),
    tags: z
      .array(z.string())
      .optional()
      .describe('Tag names (fuzzy-matched against existing tags: exact → case-insensitive → slug; unmatched names are created automatically)'),
    visibility: z
      .enum(['public', 'unlisted', 'private'])
      .default('public')
      .describe('Visibility level'),
    published: z
      .boolean()
      .default(true)
      .describe('Whether to publish immediately or save as draft'),
    summary: z.string().optional().describe('Short summary / excerpt'),
    lang: z.string().optional().describe('Language code (e.g. "en", "zh")'),
    category_name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Category name (matched or created automatically)'),
  },
  { destructiveHint: false, readOnlyHint: false, idempotentHint: false },
  async ({ title, content, tags, visibility, published, summary, lang, category_name }) => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await createTil(api, {
      title,
      content,
      tags,
      visibility,
      published,
      summary,
      lang,
      category_name,
    });
    return { content: [{ type: 'text' as const, text }] };
  },
);

// 6. list_categories — Browse site categories
server.tool(
  'list_categories',
  "List all categories for the user's site",
  {
    force: z
      .boolean()
      .optional()
      .default(false)
      .describe('Force refresh, bypassing cache'),
  },
  { readOnlyHint: true },
  async ({ force }) => {
    const api = createApi();
    if (!api) return { content: [{ type: 'text' as const, text: NO_TOKEN_MESSAGE }] };

    const text = await listCategories(api, force);
    return { content: [{ type: 'text' as const, text }] };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Use stderr — stdout is reserved for JSON-RPC in stdio transport
  console.error('OpenTIL MCP Server running on stdio');
  console.error('Tip: Remote HTTP endpoint available at https://opentil.ai/mcp — zero install, just configure a URL.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
