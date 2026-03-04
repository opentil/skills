import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { FileCache } from '../cache.js';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  entries_count: number;
  position: number;
}

interface CategoriesResponse {
  data: CategoryItem[];
}

const CACHE_PATH = join(homedir(), '.til', 'cache', 'categories.json');
const categoriesCache = new FileCache<CategoryItem[]>(CACHE_PATH);

export { categoriesCache };

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

export async function fetchCategories(
  api: ApiClient,
  force = false,
): Promise<CategoryItem[]> {
  if (!force) {
    const cached = categoriesCache.get();
    if (cached) return cached;
  } else {
    categoriesCache.invalidate();
  }

  try {
    const res = await api.get<CategoriesResponse>('/categories');
    categoriesCache.set(res.data);
    return res.data;
  } catch (err) {
    // force mode: never fall back to stale cache — surface the real error
    if (force) throw err;

    // Normal mode: fall back to stale cache if available, otherwise throw
    const stale = categoriesCache.getStale();
    if (stale) return stale;
    throw err;
  }
}
