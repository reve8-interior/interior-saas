import { api } from '@/lib/api';
import { checkIntake, preselectRoom } from '@/lib/intake';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));

describe('checkIntake', () => {
  it('posts the rows to the client-scoped route and unwraps the results', async () => {
    const result = {
      room: 'Living Room',
      room_status: 'existing',
      similar: null,
    };
    vi.mocked(api.post).mockResolvedValue({ rows: [result] });
    const rows = [{ room: 'living room', description: 'Sofa' }];
    expect(await checkIntake('c1', rows)).toEqual([result]);
    expect(api.post).toHaveBeenCalledWith(
      '/clients/c1/quotation/intake-check',
      {
        rows,
      }
    );
  });
});

describe('preselectRoom', () => {
  it('uses the only room when nothing is typed', () => {
    expect(preselectRoom('', ['Hall'])).toBe('Hall');
    expect(preselectRoom('', ['Hall', 'Kitchen'])).toBe('');
  });

  it("snaps a case-different room to the quotation's spelling", () => {
    expect(preselectRoom('living room', ['Living Room', 'Kitchen'])).toBe(
      'Living Room'
    );
  });

  it('leaves a room the quotation does not have', () => {
    expect(preselectRoom('Study', ['Hall'])).toBe('Study');
  });
});
