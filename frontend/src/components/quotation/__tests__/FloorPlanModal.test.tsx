import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FloorPlanDraftResponse,
  FloorPlanExtractResponse,
} from '@/lib/floorPlan';
import { FloorPlanModal } from '../FloorPlanModal';

const extractFloorPlan = vi.fn();
const draftFromFloorPlan = vi.fn();
const saveFromExtraction = vi.fn();

vi.mock('@/lib/floorPlan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/floorPlan')>()),
  extractFloorPlan: (...a: unknown[]) => extractFloorPlan(...a),
  draftFromFloorPlan: (...a: unknown[]) => draftFromFloorPlan(...a),
}));
vi.mock('@/lib/checkpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/checkpoints')>()),
  saveFromExtraction: (...a: unknown[]) => saveFromExtraction(...a),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const PLAN_PATH = 'floorplans/c1/p1.png';

const extracted: FloorPlanExtractResponse = {
  source_image_path: PLAN_PATH,
  audit_log_id: 'log-1',
  rooms: [
    {
      name: 'Hall',
      length_ft: 15,
      width_ft: 12,
      match_status: 'new',
    },
  ],
  existing_rooms: [],
  warnings: [],
  model: 'gpt-test',
};

const drafted: FloorPlanDraftResponse = {
  line_items: [
    {
      room: 'Hall',
      description: 'False ceiling',
      unit: 'sqft',
      raw_dimension: '15x12',
      qty: 180,
      rate: null,
      action: 'add',
      match: null,
    },
  ],
  summary_text: 'Draft from floor plan: Hall',
  warnings: [],
};

function chooseFile() {
  const input = document.querySelector('input[type="file"]') as HTMLElement;
  const file = new File(['x'], 'plan.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:plan');
  URL.revokeObjectURL = vi.fn();
  extractFloorPlan.mockResolvedValue(extracted);
  draftFromFloorPlan.mockResolvedValue(drafted);
  saveFromExtraction.mockResolvedValue({ checkpoint_id: 'cp-1' });
});

describe('FloorPlanModal', () => {
  it('tells the designer the plan counts toward the image limit', () => {
    render(
      <FloorPlanModal clientId="c1" onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(screen.getByText(/counts toward your image limit/i)).toBeTruthy();
  });

  it('sends the stored plan key back when the draft is saved', async () => {
    const onSaved = vi.fn();
    render(
      <FloorPlanModal clientId="c1" onClose={vi.fn()} onSaved={onSaved} />
    );
    chooseFile();
    fireEvent.click(await screen.findByText('Create draft rows'));
    await waitFor(() => expect(saveFromExtraction).toHaveBeenCalled());
    const [clientId, body] = saveFromExtraction.mock.calls[0];
    expect(clientId).toBe('c1');
    expect(body.source_image_path).toBe(PLAN_PATH);
    expect(body.audit_log_id).toBe('log-1');
    expect(onSaved).toHaveBeenCalledWith('cp-1');
  });

  it('keeps the key from the latest plan read', async () => {
    extractFloorPlan.mockResolvedValue({
      ...extracted,
      source_image_path: 'floorplans/c1/second.png',
    });
    render(
      <FloorPlanModal clientId="c1" onClose={vi.fn()} onSaved={vi.fn()} />
    );
    chooseFile();
    fireEvent.click(await screen.findByText('Create draft rows'));
    await waitFor(() => expect(saveFromExtraction).toHaveBeenCalled());
    expect(saveFromExtraction.mock.calls[0][1].source_image_path).toBe(
      'floorplans/c1/second.png'
    );
  });

  it('saves nothing when the plan cannot be read', async () => {
    extractFloorPlan.mockRejectedValue(new Error('unreadable'));
    render(
      <FloorPlanModal clientId="c1" onClose={vi.fn()} onSaved={vi.fn()} />
    );
    chooseFile();
    await waitFor(() => expect(extractFloorPlan).toHaveBeenCalled());
    expect(screen.queryByText('Create draft rows')).toBeNull();
    expect(saveFromExtraction).not.toHaveBeenCalled();
  });
});
