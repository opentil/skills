import type { ApiClient } from '../api-client.js';
import { ApiError, formatError } from '../errors.js';
import { taxonomyCache, fetchCategories, fetchTags, fetchSeries } from './list-categories.js';
import type { TagItem, SeriesItem } from './list-categories.js';

interface CreateParams {
  title: string;
  content: string;
  tags?: string[];
  visibility?: string;
  published?: boolean;
  summary?: string;
  lang?: string;
  category_name?: string;
  series_name?: string;
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
  let categories;
  try {
    categories = await fetchCategories(api);
  } catch {
    // Category resolution failure should never block entry creation
    return name;
  }
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

/**
 * Match a series name against cached series.
 * Priority: exact title → case-insensitive → slug match.
 * No match → return original name (server will find-or-create).
 */
async function resolveSeries(
  api: ApiClient,
  name: string,
): Promise<string> {
  let seriesList: SeriesItem[];
  try {
    seriesList = await fetchSeries(api);
  } catch {
    return name;
  }
  if (seriesList.length === 0) return name;

  const lower = name.toLowerCase();
  const slug = lower.replace(/\s+/g, '-');

  const exact = seriesList.find((s) => s.title === name);
  if (exact) return exact.title;

  const ci = seriesList.find((s) => s.title.toLowerCase() === lower);
  if (ci) return ci.title;

  const slugMatch = seriesList.find((s) => s.slug === slug);
  if (slugMatch) return slugMatch.title;

  return name;
}

/**
 * Match a tag name against cached tags.
 * Priority: exact name → case-insensitive → slug match.
 * No match → return original name (server will find-or-create).
 */
function resolveTagName(tagName: string, cachedTags: TagItem[]): string {
  const lower = tagName.toLowerCase();
  const slug = lower.replace(/\s+/g, '-');

  // Exact match
  const exact = cachedTags.find((t) => t.name === tagName);
  if (exact) return exact.name;

  // Case-insensitive match
  const ci = cachedTags.find((t) => t.name.toLowerCase() === lower);
  if (ci) return ci.name;

  // Slug match
  const slugMatch = cachedTags.find((t) => t.slug === slug);
  if (slugMatch) return slugMatch.name;

  // No match — return original (server will find-or-create)
  return tagName;
}

async function resolveTags(
  api: ApiClient,
  names: string[],
): Promise<string[]> {
  let cachedTags: TagItem[];
  try {
    cachedTags = await fetchTags(api);
  } catch {
    // Tag resolution failure should never block entry creation
    return names;
  }

  if (cachedTags.length === 0) return names;
  return names.map((name) => resolveTagName(name, cachedTags));
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

    // Resolve series name against cache
    let seriesName = params.series_name;
    if (seriesName) {
      seriesName = await resolveSeries(api, seriesName);
    }

    // Resolve tag names against cache
    let tagNames = params.tags;
    if (tagNames && tagNames.length > 0) {
      tagNames = await resolveTags(api, tagNames);
    }

    const body: Record<string, unknown> = {
      entry: {
        title: params.title,
        content: params.content,
        visibility: params.visibility || 'public',
        published: params.published ?? true,
        ...(params.summary && { summary: params.summary }),
        ...(params.lang && { lang: params.lang }),
        ...(tagNames && { tag_names: tagNames }),
        ...(categoryName && { category_name: categoryName }),
        ...(seriesName && { series_name: seriesName }),
      },
    };

    const e = await api.post<EntryResponse>('/entries', body);

    // Invalidate taxonomy cache — entry creation may have created new tags/categories/series
    taxonomyCache.invalidate();

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
    if (err instanceof ApiError && err.status === 409 && err.code === 'duplicate_content') {
      const existing = err.body?.entry as Record<string, unknown> | undefined;
      const lines = ['Duplicate content — this entry already exists on the server. No action needed.'];
      if (existing?.id) lines.push(`ID: ${existing.id}`);
      if (existing?.url) lines.push(`URL: ${existing.url}`);
      return lines.join('\n');
    }
    return `Error creating entry: ${formatError(err)}`;
  }
}
