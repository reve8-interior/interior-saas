import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckpointCard } from '../CheckpointCard';
import type { Checkpoint } from '../types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/lineItemColumns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lineItemColumns')>();
  return {
    ...actual,
    useLineItemColumns: () => ({ columns: actual.DEFAULT_LINE_ITEM_COLUMNS }),
  };
});
const patch = vi.fn();
const toastFn = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { patch: (...a: unknown[]) => patch(...a) },
}));
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastFn(...a), {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

const PLAN_URL = 'https://api.test/api/v1/media/floorplans/c1/p1.view.webp?x=1';

const checkpoint = (over: Partial<Checkpoint> = {}): Checkpoint => ({
  id: 'cp-1',
  summary_text: 'Draft from floor plan: Hall',
  structured_diff: {},
  raw_conversation: null,
  audio_transcript: null,
  status: 'draft',
  source: 'ai_extract',
  added_to_quotation: false,
  created_at: '2030-01-01T00:00:00Z',
  ...over,
});

function renderCard(cp: Checkpoint) {
  return render(
    <CheckpointCard
      cp={cp}
      number={2}
      clientId="c1"
      onQuotationUpdated={vi.fn()}
    />
  );
}

describe('CheckpointCard floor plan', () => {
  it('has no Floor plan tab when the meeting has no plan', () => {
    renderCard(checkpoint());
    expect(screen.queryByRole('tab', { name: 'Floor plan' })).toBeNull();
  });

  it('shows a Floor plan tab when the meeting kept one', () => {
    renderCard(checkpoint({ source_image_url: PLAN_URL }));
    expect(screen.getByRole('tab', { name: 'Floor plan' })).toBeTruthy();
  });

  it('shows the plan image, linked to the larger version, on that tab', () => {
    renderCard(checkpoint({ source_image_url: PLAN_URL }));
    fireEvent.click(screen.getByRole('tab', { name: 'Floor plan' }));
    const img = screen.getByAltText('Floor plan for meeting #2');
    expect(img.getAttribute('src')).toBe(PLAN_URL);
    const link = img.closest('a');
    expect(link?.getAttribute('href')).toBe(PLAN_URL);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('does not show the plan until its tab is chosen', () => {
    renderCard(checkpoint({ source_image_url: PLAN_URL }));
    expect(screen.queryByAltText('Floor plan for meeting #2')).toBeNull();
  });

  it('treats a null url like no plan', () => {
    renderCard(checkpoint({ source_image_url: null }));
    expect(screen.queryByRole('tab', { name: 'Floor plan' })).toBeNull();
  });
});

const row = (room: string) => ({
  action: 'add',
  room,
  description: 'Work',
  unit: 'sqft',
  qty: 1,
  rate: 10,
  verified: false,
});

const withRows = (rooms: string[], over: Partial<Checkpoint> = {}) =>
  checkpoint({
    structured_diff: { line_items: rooms.map(row) },
    ...over,
  });

describe('CheckpointCard editing rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patch.mockResolvedValue({});
  });

  const savedRooms = () =>
    (patch.mock.calls.at(-1)?.[1].line_items as { room: string }[]).map(
      (r) => r.room
    );

  it('removes a row and saves the rest', async () => {
    renderCard(withRows(['Hall', 'Kitchen']));
    fireEvent.click(screen.getAllByLabelText('Remove row 1')[0]);
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls.at(-1)?.[0]).toBe(
      '/checkpoints/cp-1/extracted-items'
    );
    expect(savedRooms()).toEqual(['Kitchen']);
  });

  it('puts the row back where it was when Undo is pressed', async () => {
    renderCard(withRows(['Hall', 'Kitchen', 'Study']));
    fireEvent.click(screen.getAllByLabelText('Remove row 2')[0]);
    await waitFor(() => expect(savedRooms()).toEqual(['Hall', 'Study']));
    const { action } = toastFn.mock.calls.at(-1)?.[1];
    act(() => action.onClick());
    await waitFor(() =>
      expect(savedRooms()).toEqual(['Hall', 'Kitchen', 'Study'])
    );
  });

  it('adds a blank row and saves it', async () => {
    renderCard(withRows(['Hall']));
    fireEvent.click(screen.getByText('+ Add row'));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(savedRooms()).toEqual(['Hall', '']);
  });

  it('offers no remove buttons once the meeting is on the quotation', () => {
    renderCard(withRows(['Hall'], { added_to_quotation: true }));
    for (const b of screen.queryAllByLabelText('Remove row 1')) {
      expect(b).toBeDisabled();
    }
    expect(screen.queryByText('+ Add row')).toBeNull();
  });
});

describe('CheckpointCard changing a row action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patch.mockResolvedValue({});
  });

  const savedRows = () =>
    patch.mock.calls.at(-1)?.[1].line_items as Record<string, unknown>[];

  it('saves the new action', async () => {
    renderCard(withRows(['Hall']));
    fireEvent.change(screen.getAllByLabelText('Action for row 1')[0], {
      target: { value: 'remove' },
    });
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(savedRows()[0].action).toBe('remove');
  });

  it('drops the link to the quotation line when a row becomes new', async () => {
    const linked = {
      ...row('Hall'),
      action: 'update',
      target_item_id: 'li-1',
      target_summary: 'Hall - Work',
    };
    renderCard(checkpoint({ structured_diff: { line_items: [linked] } }));
    fireEvent.change(screen.getAllByLabelText('Action for row 1')[0], {
      target: { value: 'add' },
    });
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(savedRows()[0]).toMatchObject({
      action: 'add',
      target_item_id: null,
      target_summary: null,
    });
  });

  it('keeps the link when an update becomes a removal', async () => {
    const linked = {
      ...row('Hall'),
      action: 'update',
      target_item_id: 'li-1',
      target_summary: 'Hall - Work',
    };
    renderCard(checkpoint({ structured_diff: { line_items: [linked] } }));
    fireEvent.change(screen.getAllByLabelText('Action for row 1')[0], {
      target: { value: 'remove' },
    });
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(savedRows()[0]).toMatchObject({
      action: 'remove',
      target_item_id: 'li-1',
    });
  });

  it('cannot change the action once the meeting is on the quotation', () => {
    renderCard(withRows(['Hall'], { added_to_quotation: true }));
    expect(screen.queryByLabelText('Action for row 1')).toBeNull();
  });
});
