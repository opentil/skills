import type { ApiClient } from '../api-client.js';
import { formatError } from '../errors.js';

interface UserResponse {
  id: string;
  nickname: string;
  email?: string;
}

interface SiteResponse {
  username: string;
  title: string;
  bio: string;
  entries_count: number;
  public_url: string;
  last_posted_at: string | null;
}

interface TagItem {
  name: string;
  slug: string;
  taggings_count: number;
}

interface TagsResponse {
  data: TagItem[];
}

export async function getProfile(api: ApiClient): Promise<string> {
  try {
    const [user, site, tagsRes] = await Promise.all([
      api.get<UserResponse>('/users/me'),
      api.get<SiteResponse>('/site'),
      api.get<TagsResponse>('/tags', { sort: 'popular', per_page: 20 }),
    ]);

    const tags = tagsRes.data;
    const topTags = tags
      .map((t) => `${t.name} (${t.taggings_count})`)
      .join(', ');

    return [
      `Username: @${site.username}`,
      `Nickname: ${user.nickname || site.username}`,
      site.title ? `Site: ${site.title}` : null,
      site.bio ? `Bio: ${site.bio}` : null,
      `Total entries: ${site.entries_count}`,
      site.last_posted_at ? `Last posted: ${site.last_posted_at.slice(0, 10)}` : null,
      `URL: ${site.public_url}`,
      topTags ? `Top tags: ${topTags}` : 'No tags yet',
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    return `Error fetching profile: ${formatError(err)}`;
  }
}
