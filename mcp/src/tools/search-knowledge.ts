import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { truncate } from '../utils.js';

interface EntryItem {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  tags: { name: string }[];
}

interface EntriesResponse {
  data: EntryItem[];
  meta: { total_count: number };
}

export async function searchKnowledge(
  api: ApiClient,
  query: string,
  tag?: string,
  limit?: number,
): Promise<string> {
  try {
    const res = await api.get<EntriesResponse>('/entries', {
      q: query,
      tag,
      status: 'published',
      per_page: limit || 5,
    });

    if (res.data.length === 0) {
      return `No results for "${query}". The user may not have written about this topic yet.`;
    }

    const entries = res.data.map((e) => {
      const tags = e.tags.map((t) => t.name).join(', ');
      const excerpt = e.summary || truncate(e.content, 150);
      return [
        `- [${e.id}] **${e.title}**`,
        tags ? `  Tags: ${tags}` : null,
        `  ${excerpt}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return [
      `Found ${res.meta.total_count} result(s), showing ${res.data.length}:\n`,
      ...entries,
    ].join('\n');
  } catch (err) {
    return `Error searching: ${formatError(err)}`;
  }
}
