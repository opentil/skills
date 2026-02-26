import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';

interface CreateParams {
  title: string;
  content: string;
  tags?: string[];
  visibility?: string;
  published?: boolean;
  summary?: string;
  lang?: string;
}

interface EntryResponse {
  id: string;
  title: string;
  published: boolean;
  visibility: string;
  url: string;
}

export async function createTil(
  api: ApiClient,
  params: CreateParams,
): Promise<string> {
  try {
    const body: Record<string, unknown> = {
      entry: {
        title: params.title,
        content: params.content,
        visibility: params.visibility || 'public',
        published: params.published ?? true,
        ...(params.summary && { summary: params.summary }),
        ...(params.lang && { lang: params.lang }),
        ...(params.tags && { tag_names: params.tags }),
      },
    };

    const e = await api.post<EntryResponse>('/entries', body);

    return [
      `Created: ${e.title}`,
      `ID: ${e.id}`,
      `Status: ${e.published ? 'published' : 'draft'}`,
      `Visibility: ${e.visibility}`,
      e.url ? `URL: ${e.url}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    return `Error creating entry: ${formatError(err)}`;
  }
}
