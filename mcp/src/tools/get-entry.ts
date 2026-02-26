import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';

interface EntryResponse {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: { name: string }[];
  category: { name: string } | null;
  visibility: string;
  published: boolean;
  published_at: string | null;
  url: string;
}

export async function getEntry(api: ApiClient, id: string): Promise<string> {
  try {
    const e = await api.get<EntryResponse>(`/entries/${id}`);

    const tags = e.tags.map((t) => t.name).join(', ');

    return [
      `# ${e.title}`,
      '',
      e.category ? `Category: ${e.category.name}` : null,
      tags ? `Tags: ${tags}` : null,
      `Visibility: ${e.visibility}`,
      `Published: ${e.published ? e.published_at?.slice(0, 10) || 'yes' : 'draft'}`,
      e.url ? `URL: ${e.url}` : null,
      '',
      e.content,
    ]
      .filter((line) => line !== null)
      .join('\n');
  } catch (err) {
    return `Error fetching entry: ${formatError(err)}`;
  }
}
