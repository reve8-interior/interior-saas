import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignLibraryItem } from '@/lib/schemas/site';
import { ProjectDesignPicker } from '../ProjectDesignPicker';

const site = vi.hoisted(() => ({
  attachDesigns: vi.fn(),
  uploadProjectImage: vi.fn(),
}));
vi.mock('@/lib/site', () => site);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LIB: DesignLibraryItem[] = [
  {
    id: 'd1',
    title: 'Living',
    thumb_url: null,
    client_name: 'Asha',
    project_id: null,
  },
  {
    id: 'd2',
    title: 'Kitchen',
    thumb_url: null,
    client_name: null,
    project_id: null,
  },
  {
    id: 'd3',
    title: 'Hall',
    thumb_url: null,
    client_name: null,
    project_id: 'other',
  },
];

function setup() {
  const onDone = vi.fn();
  render(<ProjectDesignPicker projectId="p1" library={LIB} onDone={onDone} />);
  return onDone;
}

describe('ProjectDesignPicker', () => {
  beforeEach(() => {
    site.attachDesigns.mockReset().mockResolvedValue({});
    site.uploadProjectImage.mockReset().mockResolvedValue({});
  });

  it('attaches the selected designs on confirm', async () => {
    const onDone = setup();
    fireEvent.click(screen.getByLabelText('Living'));
    fireEvent.click(screen.getByLabelText('Kitchen'));
    fireEvent.click(screen.getByRole('button', { name: /add 2 selected/i }));
    await waitFor(() =>
      expect(site.attachDesigns).toHaveBeenCalledWith('p1', ['d1', 'd2'])
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('marks designs that are in another project', () => {
    setup();
    expect(screen.getByText('In another project')).toBeTruthy();
  });

  it('keeps confirm disabled with nothing selected', () => {
    setup();
    const btn = screen.getByRole('button', { name: /add selected/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('uploads each chosen file', async () => {
    const onDone = setup();
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.webp', { type: 'image/webp' });
    const input = document.getElementById('project-upload');
    if (!input) throw new Error('upload input missing');
    fireEvent.change(input, { target: { files: [a, b] } });
    await waitFor(() =>
      expect(site.uploadProjectImage).toHaveBeenCalledTimes(2)
    );
    expect(site.uploadProjectImage).toHaveBeenNthCalledWith(1, 'p1', a, 'a');
    expect(site.uploadProjectImage).toHaveBeenNthCalledWith(2, 'p1', b, 'b');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
