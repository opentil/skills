import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { FileCache } from '../cache.js';

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  entries_count: number;
  position: number;
}

export interface TagItem {
  id: string;
  name: string;
  slug: string;
  taggings_count: number;
}

interface TaxonomyData {
  categories: CategoryItem[];
  tags: TagItem[];
}

// Categories API returns { data: [...], meta: {} }
interface CategoriesResponse {
  data: CategoryItem[];
}

const TAXONOMY_CACHE_PATH = join(homedir(), '.til', 'cache', 'taxonomy.json');
const taxonomyCache = new FileCache<TaxonomyData>(TAXONOMY_CACHE_PATH);

export { taxonomyCache };

export async function listCategories(
  api: ApiClient,
  force = false,
): Promise<string> {
  try {
    const categories = await fetchCategories(api, force);

    if (categories.length === 0) {
      return 'No categories yet.';
    }

    const lines = categories.map((cat) => {
      const parts = [
        `- ${cat.name} (${cat.slug}) — ${cat.entries_count} entries`,
      ];
      if (cat.description) {
        parts.push(`  ${cat.description}`);
      }
      return parts.join('\n');
    });

    return [`${categories.length} categories:\n`, ...lines].join('\n');
  } catch (err) {
    return `Error fetching categories: ${formatError(err)}`;
  }
}

export async function fetchTaxonomy(
  api: ApiClient,
  force = false,
): Promise<TaxonomyData> {
  if (!force) {
    const cached = taxonomyCache.get();
    if (cached) return cached;
  } else {
    taxonomyCache.invalidate();
  }

  try {
    // Try taxonomy endpoint first (combined categories + tags)
    const res = await api.get<TaxonomyData>('/taxonomy');
    taxonomyCache.set(res);
    return res;
  } catch (taxonomyErr) {
    // Only fallback to categories-only endpoint for older servers (404)
    const is404 =
      taxonomyErr instanceof Error &&
      'status' in taxonomyErr &&
      (taxonomyErr as { status: number }).status === 404;

    if (is404) {
      try {
        const res = await api.get<CategoriesResponse>('/categories');
        const data: TaxonomyData = { categories: res.data, tags: [] };
        taxonomyCache.set(data);
        return data;
      } catch (err) {
        if (force) throw err;

        const stale = taxonomyCache.getStale();
        if (stale) return stale;
        throw err;
      }
    }

    // Non-404 error (auth, server error, etc.) — no point trying /categories
    if (force) throw taxonomyErr;

    const stale = taxonomyCache.getStale();
    if (stale) return stale;
    throw taxonomyErr;
  }
}

export async function fetchCategories(
  api: ApiClient,
  force = false,
): Promise<CategoryItem[]> {
  const taxonomy = await fetchTaxonomy(api, force);
  return taxonomy.categories;
}

export async function fetchTags(
  api: ApiClient,
  force = false,
): Promise<TagItem[]> {
  const taxonomy = await fetchTaxonomy(api, force);
  return taxonomy.tags;
}
