import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { categoriesCache, fetchCategories } from './list-categories.js';

interface CreateParams {
  title: string;
  content: string;
  tags?: string[];
  visibility?: string;
  published?: boolean;
  summary?: string;
  lang?: string;
  category_name?: string;
}

interface EntryResponse {
  id: string;
  title: string;
  published: boolean;
  visibility: string;
  url: string;
}

/**
 * Match a category name against cached categories.
 * Priority: exact name → case-insensitive → slug match.
 */
async function resolveCategory(
  api: ApiClient,
  name: string,
): Promise<string> {
  const categories = await fetchCategories(api);
  if (categories.length === 0) return name;

  const lower = name.toLowerCase();
  const slug = lower.replace(/\s+/g, '-');

  // Exact match
  const exact = categories.find((c) => c.name === name);
  if (exact) return exact.name;

  // Case-insensitive match
  const ci = categories.find((c) => c.name.toLowerCase() === lower);
  if (ci) return ci.name;

  // Slug match
  const slugMatch = categories.find((c) => c.slug === slug);
  if (slugMatch) return slugMatch.name;

  // No match — return original name (server will create it)
  return name;
}

export async function createTil(
  api: ApiClient,
  params: CreateParams,
): Promise<string> {
  try {
    // Resolve category name against cache
    let categoryName = params.category_name;
    if (categoryName) {
      categoryName = await resolveCategory(api, categoryName);
    }

    const body: Record<string, unknown> = {
      entry: {
        title: params.title,
        content: params.content,
        visibility: params.visibility || 'public',
        published: params.published ?? true,
        ...(params.summary && { summary: params.summary }),
        ...(params.lang && { lang: params.lang }),
        ...(params.tags && { tag_names: params.tags }),
        ...(categoryName && { category_name: categoryName }),
      },
    };

    const e = await api.post<EntryResponse>('/entries', body);

    // Invalidate category cache — entry creation may have created a new category
    categoriesCache.invalidate();

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
