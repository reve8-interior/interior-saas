'use client';

import { ProjectDesignPicker } from '@/components/website/ProjectDesignPicker';
import { ProjectForm } from '@/components/website/ProjectForm';
import { ErrorState, PageSkeleton } from '@/components/ui';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Modal } from '@/components/ui/Modal';
import { CARD_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { moveId } from '@/lib/portfolioOrder';
import type { Project, ProjectUpdateInput } from '@/lib/schemas/site';
import {
  createProject,
  deleteProject,
  detachDesign,
  listDesignLibrary,
  listProjects,
  reorderProjectDesigns,
  reorderProjects,
  updateProject,
} from '@/lib/site';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

const PROJECTS_KEY = ['site-projects'];
const LIBRARY_KEY = ['site-design-library'];

const DELETE_PROJECT_TEXT =
  'Delete this project? Designs from your clients stay in their folders, ' +
  'but images uploaded directly into this project will be permanently deleted.';
const REMOVE_DESIGN_TEXT =
  'Remove this image from the project? If it was uploaded directly into ' +
  'the project it will be permanently deleted; client designs are kept.';

interface RemovingDesign {
  project: Project;
  designId: string;
}

interface ProjectsManagerProps {
  /** Full-site plans can edit projects; others can only review and delete. */
  paid: boolean;
}

/** Create, edit, order and delete the case-study projects shown on the public website. */
export function ProjectsManager({ paid }: ProjectsManagerProps) {
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: listProjects,
  });
  const library = useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: listDesignLibrary,
    enabled: paid,
  });

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [removing, setRemoving] = useState<RemovingDesign | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    qc.invalidateQueries({ queryKey: LIBRARY_KEY });
  };
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const create = useMutation({
    mutationFn: (input: ProjectUpdateInput) =>
      createProject({
        title: input.title ?? '',
        location: input.location,
        year: input.year,
        category: input.category,
        story: input.story,
      }),
    onSuccess: (p) => {
      setCreating(false);
      setEditingId(p.id);
      refresh();
      toast.success('Project created');
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; input: ProjectUpdateInput }) =>
      updateProject(v.id, v.input),
    onSuccess: () => {
      refresh();
      toast.success('Project saved');
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (p: Project) => deleteProject(p.id),
    onSuccess: (_, p) => {
      if (editingId === p.id) setEditingId(null);
      setDeleting(null);
      refresh();
      toast.success('Project deleted');
    },
    onError: (err) => {
      setDeleting(null);
      onError(err);
    },
  });
  const orderProjects = useMutation({
    mutationFn: reorderProjects,
    onSuccess: refresh,
    onError,
  });
  const orderDesigns = useMutation({
    mutationFn: (v: { id: string; ids: string[] }) =>
      reorderProjectDesigns(v.id, v.ids),
    onSuccess: refresh,
    onError,
  });
  const detach = useMutation({
    mutationFn: (v: RemovingDesign) => detachDesign(v.project.id, v.designId),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
    onError: (err) => {
      setRemoving(null);
      onError(err);
    },
  });

  if (projects.isLoading || (paid && library.isLoading))
    return <PageSkeleton />;
  if (projects.isError || !projects.data)
    return (
      <ErrorState onRetry={() => projects.refetch()}>
        Couldn&apos;t load your projects.
      </ErrorState>
    );

  const list = projects.data;
  const moveProject = (id: string, delta: -1 | 1) => {
    const ids = list.map((p) => p.id);
    const next = moveId(ids, id, delta);
    if (next !== ids) orderProjects.mutate(next);
  };
  const moveDesign = (p: Project, id: string, delta: -1 | 1) => {
    const ids = p.designs.map((d) => d.id);
    const next = moveId(ids, id, delta);
    if (next !== ids) orderDesigns.mutate({ id: p.id, ids: next });
  };
  const picking = list.find((p) => p.id === pickingId) ?? null;

  const confirmModals = (
    <>
      <ConfirmDeleteModal
        isOpen={deleting !== null}
        isLoading={remove.isPending}
        title="Delete project"
        description={DELETE_PROJECT_TEXT}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
      <ConfirmDeleteModal
        isOpen={removing !== null}
        isLoading={detach.isPending}
        title="Remove image"
        description={REMOVE_DESIGN_TEXT}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && detach.mutate(removing)}
      />
    </>
  );

  if (!paid)
    return (
      <div className="space-y-3">
        <div className={`${CARD_CLS} space-y-1`}>
          <h2 className="font-heading text-lg font-extrabold">
            Projects need a paid plan
          </h2>
          <p className="text-sm text-dark-600 dark:text-dark-300">
            Upgrade to showcase case-study projects on your website. You can
            still review and delete the projects below.
          </p>
        </div>
        {list.map((p) => (
          <section key={p.id} className={`${CARD_CLS} space-y-3`}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-heading font-extrabold">
                  {p.title}
                </h3>
                <p className="text-xs text-dark-500">
                  {p.designs.length} image{p.designs.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleting(p)}
              >
                Delete project
              </button>
            </div>
            {p.designs.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {p.designs.map((d) => (
                  <li
                    key={d.id}
                    className="overflow-hidden rounded-lg border border-dark-200 dark:border-white/10"
                  >
                    <div className="aspect-[4/3] bg-dark-100 dark:bg-white/5">
                      {d.thumb_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.thumb_url}
                          alt={d.title ?? ''}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="w-full p-1 text-xs text-red-600 underline"
                      onClick={() =>
                        setRemoving({ project: p, designId: d.id })
                      }
                    >
                      Remove image
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {confirmModals}
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setCreating(true)}
        >
          New project
        </button>
      </div>

      {creating && (
        <ProjectForm
          saving={create.isPending}
          onSave={(input) => create.mutate(input)}
          onCancel={() => setCreating(false)}
        />
      )}

      {list.length === 0 && !creating && (
        <p className={`${CARD_CLS} text-sm text-dark-500`}>
          No projects yet. Create one to feature on your website.
        </p>
      )}

      {list.map((p, i) => (
        <section key={p.id} className={`${CARD_CLS} space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-heading font-extrabold">
                {p.title}
              </h3>
              <p className="text-xs text-dark-500">
                {p.designs.length} image{p.designs.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Move ${p.title} up`}
              disabled={i === 0 || orderProjects.isPending}
              onClick={() => moveProject(p.id, -1)}
            >
              Up
            </button>
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Move ${p.title} down`}
              disabled={i === list.length - 1 || orderProjects.isPending}
              onClick={() => moveProject(p.id, 1)}
            >
              Down
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditingId(editingId === p.id ? null : p.id)}
            >
              {editingId === p.id ? 'Close' : 'Edit'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleting(p)}
            >
              Delete
            </button>
          </div>

          {editingId === p.id && (
            <div className="space-y-4">
              <ProjectForm
                key={p.id}
                project={p}
                saving={update.isPending}
                onSave={(input) => update.mutate({ id: p.id, input })}
                onCancel={() => setEditingId(null)}
              />
              <div className="flex items-center justify-between">
                <h4 className="label-text">Images</h4>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPickingId(p.id)}
                >
                  Add images
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.designs.map((d, di) => (
                  <li
                    key={d.id}
                    className="overflow-hidden rounded-xl border border-dark-200 dark:border-white/10"
                  >
                    <div className="aspect-[4/3] bg-dark-100 dark:bg-white/5">
                      {d.thumb_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.thumb_url}
                          alt={d.title ?? ''}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="space-y-0.5 px-2 pt-2 text-xs">
                      <p className="truncate font-medium">
                        {d.title || 'Untitled'}
                      </p>
                      <p className="text-dark-500">
                        Shown publicly on your website. Edit the title in the
                        design editor.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 p-2 text-xs">
                      <button
                        type="button"
                        aria-label="Move image earlier"
                        disabled={di === 0 || orderDesigns.isPending}
                        onClick={() => moveDesign(p, d.id, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="Move image later"
                        disabled={
                          di === p.designs.length - 1 || orderDesigns.isPending
                        }
                        onClick={() => moveDesign(p, d.id, 1)}
                      >
                        →
                      </button>
                      {p.cover_design_id === d.id ? (
                        <span className="font-semibold">Cover</span>
                      ) : (
                        <button
                          type="button"
                          className="underline"
                          onClick={() =>
                            update.mutate({
                              id: p.id,
                              input: { cover_design_id: d.id },
                            })
                          }
                        >
                          Set cover
                        </button>
                      )}
                      <button
                        type="button"
                        className="ml-auto text-red-600 underline"
                        onClick={() =>
                          setRemoving({ project: p, designId: d.id })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      <Modal
        open={picking !== null}
        onClose={() => setPickingId(null)}
        title="Add images"
        maxWidth="4xl"
      >
        {picking && (
          <ProjectDesignPicker
            projectId={picking.id}
            library={library.data ?? []}
            onDone={refresh}
          />
        )}
      </Modal>

      {confirmModals}
    </div>
  );
}
