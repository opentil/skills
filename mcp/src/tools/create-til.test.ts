import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock list-categories before importing create-til
vi.mock('./list-categories.js', () => ({
  taxonomyCache: { invalidate: vi.fn() },
  fetchCategories: vi.fn(),
  fetchTags: vi.fn(),
  fetchSeries: vi.fn(),
}));

import { createTil } from './create-til.js';
import { fetchCategories, fetchTags, fetchSeries } from './list-categories.js';

const mockCategories = vi.mocked(fetchCategories);
const mockTags = vi.mocked(fetchTags);
const mockSeries = vi.mocked(fetchSeries);

function mockApi(response: Record<string, unknown> = {}) {
  return {
    post: vi.fn().mockResolvedValue({
      id: '1',
      title: 'Test',
      published: true,
      visibility: 'public',
      url: 'https://example.com/til/1',
      ...response,
    }),
    get: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCategories.mockResolvedValue([]);
  mockTags.mockResolvedValue([]);
  mockSeries.mockResolvedValue([]);
});

describe('resolveCategory (via createTil)', () => {
  const categories = [
    { id: '1', name: 'JavaScript', slug: 'javascript', description: null, entries_count: 5, position: 0 },
    { id: '2', name: 'Dev Tools', slug: 'dev-tools', description: null, entries_count: 3, position: 1 },
  ];

  it('exact match', async () => {
    mockCategories.mockResolvedValue(categories);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', category_name: 'JavaScript' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ category_name: 'JavaScript' }),
    }));
  });

  it('case-insensitive match', async () => {
    mockCategories.mockResolvedValue(categories);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', category_name: 'javascript' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ category_name: 'JavaScript' }),
    }));
  });

  it('slug match', async () => {
    mockCategories.mockResolvedValue(categories);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', category_name: 'dev tools' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ category_name: 'Dev Tools' }),
    }));
  });

  it('no match passes through original', async () => {
    mockCategories.mockResolvedValue(categories);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', category_name: 'Rust' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ category_name: 'Rust' }),
    }));
  });

  it('fetch failure passes through original', async () => {
    mockCategories.mockRejectedValue(new Error('network'));
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', category_name: 'JavaScript' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ category_name: 'JavaScript' }),
    }));
  });
});

describe('resolveSeries (via createTil)', () => {
  const seriesList = [
    { id: '1', title: 'Docker Deep Dive', slug: 'docker-deep-dive', description: null, status: 'active', entries_count: 3, position: 0 },
    { id: '2', title: 'Git Tips', slug: 'git-tips', description: null, status: 'active', entries_count: 5, position: 1 },
  ];

  it('exact match', async () => {
    mockSeries.mockResolvedValue(seriesList);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', series_name: 'Git Tips' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ series_name: 'Git Tips' }),
    }));
  });

  it('case-insensitive match', async () => {
    mockSeries.mockResolvedValue(seriesList);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', series_name: 'git tips' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ series_name: 'Git Tips' }),
    }));
  });

  it('slug match', async () => {
    mockSeries.mockResolvedValue(seriesList);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', series_name: 'docker deep dive' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ series_name: 'Docker Deep Dive' }),
    }));
  });

  it('no match passes through original', async () => {
    mockSeries.mockResolvedValue(seriesList);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', series_name: 'New Series' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ series_name: 'New Series' }),
    }));
  });

  it('fetch failure passes through original', async () => {
    mockSeries.mockRejectedValue(new Error('network'));
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', series_name: 'Git Tips' });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ series_name: 'Git Tips' }),
    }));
  });
});

describe('resolveTags (via createTil)', () => {
  const tags = [
    { id: '1', name: 'TypeScript', slug: 'typescript', taggings_count: 10 },
    { id: '2', name: 'Web Dev', slug: 'web-dev', taggings_count: 5 },
  ];

  it('resolves mixed matches', async () => {
    mockTags.mockResolvedValue(tags);
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', tags: ['typescript', 'web dev', 'new-tag'] });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ tag_names: ['TypeScript', 'Web Dev', 'new-tag'] }),
    }));
  });

  it('fetch failure passes through originals', async () => {
    mockTags.mockRejectedValue(new Error('network'));
    const api = mockApi();
    await createTil(api, { title: 'T', content: 'C', tags: ['typescript'] });
    expect(api.post).toHaveBeenCalledWith('/entries', expect.objectContaining({
      entry: expect.objectContaining({ tag_names: ['typescript'] }),
    }));
  });
});
