import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project, ProjectDesign } from '@/lib/schemas/site';
import { ProjectForm } from '../ProjectForm';

function design(id: string): ProjectDesign {
  return {
    id,
    title: id,
    client_id: null,
    position: 0,
    view_url: null,
    thumb_url: null,
  };
}

function project(cover: string | null, ids: string[]): Project {
  return {
    id: 'p1',
    title: 'Villa',
    location: null,
    year: null,
    category: null,
    story: null,
    cover_design_id: cover,
    position: 0,
    designs: ids.map(design),
  };
}

function ui(p: Project, onSave = vi.fn()) {
  return (
    <ProjectForm
      project={p}
      saving={false}
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
}

describe('ProjectForm', () => {
  it('follows a new cover from props and saves it', () => {
    const onSave = vi.fn();
    const { rerender } = render(ui(project('a', ['a', 'b']), onSave));
    rerender(ui(project('b', ['a', 'b']), onSave));
    const select = screen.getByLabelText('Cover image') as HTMLSelectElement;
    expect(select.value).toBe('b');
    fireEvent.click(screen.getByRole('button', { name: /save project/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ cover_design_id: 'b' })
    );
  });

  it('keeps typed text when designs change', () => {
    const { rerender } = render(ui(project(null, ['a'])));
    fireEvent.change(screen.getByLabelText('Story'), {
      target: { value: 'half written' },
    });
    rerender(ui(project(null, ['a', 'b'])));
    rerender(ui(project(null, ['b'])));
    expect((screen.getByLabelText('Story') as HTMLTextAreaElement).value).toBe(
      'half written'
    );
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('never saves a cover that left the project', () => {
    const onSave = vi.fn();
    const { rerender } = render(ui(project('a', ['a', 'b']), onSave));
    rerender(ui(project('a', ['b']), onSave));
    fireEvent.click(screen.getByRole('button', { name: /save project/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ cover_design_id: null })
    );
  });
});
