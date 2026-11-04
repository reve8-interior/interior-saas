import { api } from '@/lib/api';
import {
  createLineItem,
  createQuotation,
  deleteLineItem,
  getQuotation,
  updateLineItem,
} from '@/lib/quotation';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe('quotation API client', () => {
  it('getQuotation hits the client-scoped route', async () => {
    await getQuotation('c1');
    expect(api.get).toHaveBeenCalledWith('/clients/c1/quotation');
  });

  it('create posts an empty body', async () => {
    await createQuotation('c1');
    expect(api.post).toHaveBeenCalledWith('/clients/c1/quotation', {});
  });

  it('line item CRUD targets quotation-scoped routes', async () => {
    const payload = { room: 'Kitchen', description: 'Cabinet', unit: 'sqft' };
    await createLineItem('q1', payload);
    await updateLineItem('q1', 'i1', { status: 'agreed' });
    await deleteLineItem('q1', 'i1');
    expect(api.post).toHaveBeenCalledWith('/quotations/q1/items', payload);
    expect(api.patch).toHaveBeenCalledWith('/quotations/q1/items/i1', {
      status: 'agreed',
      expected_updated_at: undefined,
    });
    expect(api.delete).toHaveBeenCalledWith('/quotations/q1/items/i1', {
      params: { expected_updated_at: undefined },
    });
  });

  it('sends the loaded updated_at so a newer edit by someone else is refused', async () => {
    await updateLineItem('q1', 'i1', { qty: 2 }, '2030-01-01T00:00:00Z');
    await deleteLineItem('q1', 'i1', '2030-01-01T00:00:00Z');
    expect(api.patch).toHaveBeenCalledWith('/quotations/q1/items/i1', {
      qty: 2,
      expected_updated_at: '2030-01-01T00:00:00Z',
    });
    expect(api.delete).toHaveBeenCalledWith('/quotations/q1/items/i1', {
      params: { expected_updated_at: '2030-01-01T00:00:00Z' },
    });
  });
});
