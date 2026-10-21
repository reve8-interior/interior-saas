import { api } from '@/lib/api';
import {
  agreeVersion,
  createVersionShare,
  getQuotationVersion,
  getSharedQuotation,
  importQuotationVersion,
  listQuotationVersions,
  listVersionShares,
  revokeVersionShare,
  saveQuotationVersion,
  setVersionActive,
  setVersionDesigns,
  unagreeVersion,
} from '@/lib/quotationVersions';

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

describe('quotation versions api client', () => {
  it('lists and saves versions with room designs', async () => {
    await listQuotationVersions('c1');
    await saveQuotationVersion('c1', 'Draft', { Kitchen: ['d1'] });
    expect(api.get).toHaveBeenCalledWith('/clients/c1/quotation/versions');
    expect(api.post).toHaveBeenCalledWith('/clients/c1/quotation/versions', {
      label: 'Draft',
      room_designs: { Kitchen: ['d1'] },
    });
  });

  it('imports a file as multipart, label only when set', async () => {
    const file = new File(['x'], 'v.xlsx');
    await importQuotationVersion('c1', file, null);
    await importQuotationVersion('c1', file, 'Revised');
    const calls = vi.mocked(api.postForm).mock.calls;
    expect(calls[0][0]).toBe('/clients/c1/quotation/versions/import');
    expect((calls[0][1] as FormData).has('label')).toBe(false);
    expect((calls[1][1] as FormData).get('label')).toBe('Revised');
    expect((calls[1][1] as FormData).get('file')).toBeInstanceOf(File);
  });

  it('patches the active flag and puts designs', async () => {
    await setVersionActive('v1', false);
    await setVersionDesigns('v1', { Bed: [] });
    expect(api.patch).toHaveBeenCalledWith('/quotation-versions/v1/active', {
      is_active: false,
    });
    expect(api.put).toHaveBeenCalledWith('/quotation-versions/v1/designs', {
      room_designs: { Bed: [] },
    });
  });

  it('routes version detail and share management', async () => {
    const body = { show_prices: true, expires_at: null };
    await getQuotationVersion('v1');
    await listVersionShares('v1');
    await createVersionShare('v1', body);
    await revokeVersionShare('v1', 's1');
    expect(api.get).toHaveBeenCalledWith('/quotation-versions/v1');
    expect(api.get).toHaveBeenCalledWith('/quotation-versions/v1/shares');
    expect(api.post).toHaveBeenCalledWith(
      '/quotation-versions/v1/shares',
      body
    );
    expect(api.delete).toHaveBeenCalledWith('/quotation-versions/v1/shares/s1');
  });
});

describe('getSharedQuotation', () => {
  it('delegates to the public client with an encoded token', async () => {
    vi.mocked(api.getPublic).mockResolvedValue({ rooms: [] });
    expect(await getSharedQuotation('x y')).toEqual({ rooms: [] });
    expect(api.getPublic).toHaveBeenCalledWith(
      '/quotation-share/x%20y',
      'Link not available'
    );
  });
});

describe('client pick', () => {
  it('agrees and un-agrees a version', async () => {
    await agreeVersion('v1');
    expect(api.put).toHaveBeenCalledWith('/quotation-versions/v1/agree', {});
    await unagreeVersion('v1');
    expect(api.delete).toHaveBeenCalledWith('/quotation-versions/v1/agree');
  });
});
