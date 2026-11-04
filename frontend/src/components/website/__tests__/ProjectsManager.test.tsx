import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/lib/schemas/site';
import { ProjectsManager } from '../ProjectsManager';

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listDesignLibrary: vi.fn(),
  deleteProject: vi.fn(),
  reorderProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  detachDesign: vi.fn(),
  reorderProjectDesigns: vi.fn(),
}));
vi.mock('@/lib/site', () => api);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function project(id: string, title: string): Project {
  return {
    id,
    title,
    location: null,
    year: null,
    category: null,
    story: null,
    cover_design_id: null,
    position: 0,
    designs: [],
  };
}

function renderManager(paid: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsManager paid={paid} />
    </QueryClientProvider>
  );
}

describe('ProjectsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listProjects.mockResolvedValue([
      project('a', 'Villa'),
      project('b', 'Loft'),
    ]);
    api.listDesignLibrary.mockResolvedValue([]);
    api.deleteProject.mockResolvedValue(undefined);
    api.reorderProjects.mockResolvedValue(undefined);
  });

  it('shows the empty state with a New project button', async () => {
    api.listProjects.mockResolvedValue([]);
    renderManager(true);
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New project' })
    ).toBeInTheDocument();
  });

  it('disables the outer move buttons and reorders on click', async () => {
    renderManager(true);
    await screen.findByText('Villa');
    expect(
      screen.getByRole('button', { name: 'Move Villa up' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Loft down' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Villa down' }));
    await waitFor(() =>
      expect(api.reorderProjects.mock.calls[0][0]).toEqual(['b', 'a'])
    );
  });

  it('asks for confirmation before deleting a project', async () => {
    renderManager(true);
    await screen.findByText('Villa');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(
      screen.getByText(/images uploaded directly into this project/)
    ).toBeInTheDocument();
    const dialogButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(api.deleteProject).toHaveBeenCalled());
    expect(api.deleteProject.mock.calls[0][0]).toBe('a');
  });

  it('shows an upgrade prompt on a free plan but still allows deleting', async () => {
    renderManager(false);
    expect(
      await screen.findByText('Projects need a paid plan')
    ).toBeInTheDocument();
    expect(api.listDesignLibrary).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Delete project' })
    ).toHaveLength(2);
  });

  it('shows a retry state when projects fail to load', async () => {
    api.listProjects.mockRejectedValue(new Error('boom'));
    renderManager(true);
    expect(
      await screen.findByText(/Couldn.t load your projects/)
    ).toBeInTheDocument();
  });
});
