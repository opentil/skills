import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { truncate } from '../utils.js';

interface EntryItem {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  tags: { name: string }[];
  published_at: string | null;
  created_at: string;
}

interface EntriesResponse {
  data: EntryItem[];
  meta: { total_count: number };
}

export async function getRecentLearnings(
  api: ApiClient,
  limit: number,
): Promise<string> {
  try {
    const res = await api.get<EntriesResponse>('/entries', {
      status: 'published',
      sort: 'recent',
      per_page: limit,
    });

    if (res.data.length === 0) {
      return 'No published entries yet.';
    }

    const entries = res.data.map((e) => {
      const tags = e.tags.map((t) => t.name).join(', ');
      const excerpt = e.summary || truncate(e.content, 120);
      const date = e.published_at || e.created_at;
      return [
        `- **${e.title}** (${date.slice(0, 10)})`,
        tags ? `  Tags: ${tags}` : null,
        `  ${excerpt}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return [
      `Recent ${res.data.length} of ${res.meta.total_count} entries:\n`,
      ...entries,
    ].join('\n');
  } catch (err) {
    return `Error fetching recent learnings: ${formatError(err)}`;
  }
}
