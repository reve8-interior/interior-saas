import { api } from '@/lib/api';
import {
  addHotspotToQuotation,
  createHotspot,
  createPortfolioShare,
  createShareLink,
  deleteDesign,
  deleteHotspot,
  getPortfolioView,
  getSharedView,
  listDesigns,
  revokePortfolioShare,
  revokeShareLink,
  selectDesign,
  setDesignInPortfolio,
  setDesignRooms,
  updateHotspot,
  uploadDesignImage,
} from '@/lib/designs';

vi.mock('@/lib/config', () => ({ API_URL: 'http://api.test/api/v1' }));
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    postForm: vi.fn(),
    getPublic: vi.fn(),
  },
}));

const base = '/clients/c1/designs';

beforeEach(() => vi.clearAllMocks());

describe('designs api client', () => {
  it('lists designs for a client', async () => {
    await listDesigns('c1');
    expect(api.get).toHaveBeenCalledWith(base);
  });

  it('uploads as multipart and omits empty title/description', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await uploadDesignImage('c1', file, '', '');
    const [path, form] = vi.mocked(api.postForm).mock.calls[0];
    expect(path).toBe(`${base}/upload`);
    expect((form as FormData).get('file')).toBeInstanceOf(File);
    expect((form as FormData).has('title')).toBe(false);
    expect((form as FormData).has('description')).toBe(false);
  });

  it('includes title and description when given', async () => {
    const file = new File(['x'], 'a.png');
    await uploadDesignImage('c1', file, 'Living', 'Warm tones');
    const form = vi.mocked(api.postForm).mock.calls[0][1] as FormData;
    expect(form.get('title')).toBe('Living');
    expect(form.get('description')).toBe('Warm tones');
  });

  it('routes design delete and select', async () => {
    await deleteDesign('c1', 'd1');
    await selectDesign('c1', 'd1');
    expect(api.delete).toHaveBeenCalledWith(`${base}/d1`);
    expect(api.post).toHaveBeenCalledWith(`${base}/d1/select`, {});
  });

  it('routes hotspot create, update and delete', async () => {
    const body = { x: 1, y: 2, width: 3, height: 4, label: 'Sofa' } as never;
    await createHotspot('c1', 'd1', body);
    await updateHotspot('c1', 'd1', 'h1', body);
    await deleteHotspot('c1', 'd1', 'h1');
    expect(api.post).toHaveBeenCalledWith(`${base}/d1/hotspots`, body);
    expect(api.put).toHaveBeenCalledWith(`${base}/d1/hotspots/h1`, body);
    expect(api.delete).toHaveBeenCalledWith(`${base}/d1/hotspots/h1`);
  });

  it('posts add-to-quotation to the hotspot', async () => {
    const body = { room: 'Living', qty: 2 } as never;
    await addHotspotToQuotation('c1', 'd1', 'h1', body);
    expect(api.post).toHaveBeenCalledWith(
      `${base}/d1/hotspots/h1/add-to-quotation`,
      body
    );
  });

  it('wraps portfolio flag and rooms in the expected payloads', async () => {
    await setDesignInPortfolio('c1', 'd1', true);
    await setDesignRooms('c1', 'd1', ['Kitchen', 'Bed']);
    expect(api.put).toHaveBeenCalledWith(`${base}/d1/portfolio`, {
      in_portfolio: true,
    });
    expect(api.put).toHaveBeenCalledWith(`${base}/d1/rooms`, {
      rooms: ['Kitchen', 'Bed'],
    });
  });

  it('routes share links and portfolio shares', async () => {
    const link = { show_prices: false, expires_at: null, design_ids: [] };
    await createShareLink('c1', link as never);
    await revokeShareLink('c1', 'l1');
    await createPortfolioShare({ design_ids: ['d1'] } as never);
    await revokePortfolioShare('p1');
    expect(api.post).toHaveBeenCalledWith('/clients/c1/share-links', link);
    expect(api.delete).toHaveBeenCalledWith('/clients/c1/share-links/l1');
    expect(api.post).toHaveBeenCalledWith('/portfolio-shares', {
      design_ids: ['d1'],
    });
    expect(api.delete).toHaveBeenCalledWith('/portfolio-shares/p1');
  });
});

describe('public views', () => {
  it('delegates the shared view to the public client', async () => {
    vi.mocked(api.getPublic).mockResolvedValue({ project_name: 'P' });
    expect(await getSharedView('a/b c')).toEqual({ project_name: 'P' });
    expect(api.getPublic).toHaveBeenCalledWith(
      '/share/a%2Fb%20c',
      'Link not available'
    );
  });

  it('delegates the portfolio view to the public client', async () => {
    vi.mocked(api.getPublic).mockResolvedValue({});
    await getPortfolioView('t');
    expect(api.getPublic).toHaveBeenCalledWith(
      '/portfolio/t',
      'Portfolio not available'
    );
  });
});
