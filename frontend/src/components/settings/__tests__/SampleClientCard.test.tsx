import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SampleClientCard } from '../SampleClientCard';

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/useSampleClient', () => ({ useSampleClient: () => hook.value }));

const mutation = (over: Record<string, unknown> = {}) => ({
  mutate: vi.fn(),
  isPending: false,
  ...over,
});

describe('SampleClientCard', () => {
  beforeEach(() => {
    hook.value = {
      sample: undefined,
      load: mutation(),
      remove: mutation(),
    };
  });

  it('offers to load the sample when there is none', () => {
    render(<SampleClientCard />);
    fireEvent.click(screen.getByText('Load sample client'));
    expect((hook.value.load as { mutate: unknown }).mutate).toHaveBeenCalled();
    expect(screen.queryByText('Delete sample client')).toBeNull();
  });

  it('opens or deletes the sample once loaded, after confirming', () => {
    hook.value = {
      sample: { id: 'c1', name: 'Sample' },
      load: mutation(),
      remove: mutation(),
    };
    render(<SampleClientCard />);
    expect(screen.getByText('Open sample client').getAttribute('href')).toBe(
      '/dashboard/clients/c1'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete sample client' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete sample' }));
    expect(
      (hook.value.remove as { mutate: unknown }).mutate
    ).toHaveBeenCalledWith('c1', expect.anything());
  });
});
