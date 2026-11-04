import { api } from '@/lib/api';
import {
  attachDesigns,
  checkSlug,
  clearSlug,
  getPublicSite,
  listDesignLibrary,
  reorderProjectDesigns,
  slugify,
  updateProject,
  uploadBranding,
  uploadProjectImage,
} from '@/lib/site';

vi.mock('@/lib/config', () => ({ API_URL: 'http://api.test/api/v1' }));
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    postForm: vi.fn(),
    getPublic: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('slugify', () => {
  it('normalizes like the backend', () => {
    expect(slugify('  Sj Interiors! ')).toBe('sj-interiors');
    expect(slugify('a__b  c')).toBe('a-b-c');
    expect(slugify('--Hello--World--')).toBe('hello-world');
    expect(slugify('!!!')).toBe('');
  });
});

describe('site api client', () => {
  it('clears the slug with DELETE /site/slug', async () => {
    await clearSlug();
    expect(api.delete).toHaveBeenCalledWith('/site/slug');
  });

  it('fetches the public site by slug', async () => {
    await getPublicSite('sj-interiors');
    expect(api.getPublic).toHaveBeenCalledWith(
      '/site/sj-interiors',
      expect.any(String)
    );
  });

  it('encodes the slug in the URL', async () => {
    await getPublicSite('a/b?c');
    expect(api.getPublic).toHaveBeenCalledWith(
      '/site/a%2Fb%3Fc',
      expect.any(String)
    );
  });

  it('checks a slug via query param', async () => {
    await checkSlug('sj');
    expect(api.get).toHaveBeenCalledWith('/site/slug-check', {
      params: { slug: 'sj' },
    });
  });

  it('posts branding as FormData to the kind path', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await uploadBranding('logo', file);
    const [path, form] = vi.mocked(api.postForm).mock.calls[0];
    expect(path).toBe('/site/logo');
    expect((form as FormData).get('file')).toBe(file);
    await uploadBranding('hero', file);
    expect(vi.mocked(api.postForm).mock.calls[1][0]).toBe('/site/hero');
  });

  it('lists the design library', async () => {
    await listDesignLibrary();
    expect(api.get).toHaveBeenCalledWith('/projects/library');
  });

  it('attaches designs with design_ids', async () => {
    await attachDesigns('p1', ['d1', 'd2']);
    expect(api.post).toHaveBeenCalledWith('/projects/p1/designs', {
      design_ids: ['d1', 'd2'],
    });
  });

  it('reorders project designs', async () => {
    await reorderProjectDesigns('p1', ['d2', 'd1']);
    expect(api.put).toHaveBeenCalledWith('/projects/p1/designs/order', {
      design_ids: ['d2', 'd1'],
    });
  });

  it('patches a project', async () => {
    await updateProject('p1', { title: 'T' });
    expect(api.patch).toHaveBeenCalledWith('/projects/p1', { title: 'T' });
  });

  it('uploads a project image with optional title', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await uploadProjectImage('p1', file, 'Living');
    const [path, form] = vi.mocked(api.postForm).mock.calls[0];
    expect(path).toBe('/projects/p1/upload');
    expect((form as FormData).get('title')).toBe('Living');
  });
});
