import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';
import { FileCache } from '../cache.js';

interface UserResponse {
  id: string;
  nickname: string;
  email?: string;
}

interface PreferencesData {
  default_visibility: string;
  custom_instructions: string | null;
}

interface SiteResponse {
  username: string;
  title: string;
  bio: string;
  entries_count: number;
  public_url: string;
  last_posted_at: string | null;
  preferences?: PreferencesData;
}

interface TagItem {
  name: string;
  slug: string;
  taggings_count: number;
}

interface TagsResponse {
  data: TagItem[];
}

const PREFS_CACHE_PATH = join(homedir(), '.til', 'cache', 'preferences.json');
const prefsCache = new FileCache<PreferencesData>(PREFS_CACHE_PATH, 60 * 60 * 1000); // 1h TTL

export async function getProfile(api: ApiClient, profile?: string): Promise<string> {
  try {
    const [user, site, tagsRes] = await Promise.all([
      api.get<UserResponse>('/users/me'),
      api.get<SiteResponse>('/site'),
      api.get<TagsResponse>('/tags', { sort: 'popular', per_page: 20 }),
    ]);

    // Write preferences to cache (or clear stale cache if missing)
    if (site.preferences) {
      prefsCache.set(site.preferences, profile);
    } else {
      prefsCache.invalidate();
    }

    const tags = tagsRes.data;
    const topTags = tags
      .map((t) => `${t.name} (${t.taggings_count})`)
      .join(', ');

    const lines = [
      `Username: @${site.username}`,
      `Nickname: ${user.nickname || site.username}`,
      site.title ? `Site: ${site.title}` : null,
      site.bio ? `Bio: ${site.bio}` : null,
      `Total entries: ${site.entries_count}`,
      site.last_posted_at ? `Last posted: ${site.last_posted_at.slice(0, 10)}` : null,
      `URL: ${site.public_url}`,
      topTags ? `Top tags: ${topTags}` : 'No tags yet',
    ];

    // Append preferences summary
    if (site.preferences) {
      const p = site.preferences;
      lines.push('');
      lines.push('Publishing preferences:');
      lines.push(`  Visibility: ${p.default_visibility || 'public'}`);
      if (p.custom_instructions) {
        lines.push(`  Custom instructions: ${p.custom_instructions.slice(0, 100)}${p.custom_instructions.length > 100 ? '...' : ''}`);
      }
    }

    return lines.filter(Boolean).join('\n');
  } catch (err) {
    return `Error fetching profile: ${formatError(err)}`;
  }
}
