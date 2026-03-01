import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';

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

export async function listCategories(api: ApiClient): Promise<string> {
  try {
    const res = await api.get<CategoriesResponse>('/categories');

    if (res.data.length === 0) {
      return 'No categories yet.';
    }

    const lines = res.data.map((cat) => {
      const parts = [
        `- ${cat.name} (${cat.slug}) — ${cat.entries_count} entries`,
      ];
      if (cat.description) {
        parts.push(`  ${cat.description}`);
      }
      return parts.join('\n');
    });

    return [`${res.data.length} categories:\n`, ...lines].join('\n');
  } catch (err) {
    return `Error fetching categories: ${formatError(err)}`;
  }
}
