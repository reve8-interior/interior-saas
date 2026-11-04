'use client';

import { CARD_CLS, INPUT_CLS } from '@/lib/constants';
import type { Project, ProjectUpdateInput } from '@/lib/schemas/site';
import { FormEvent, useState } from 'react';

interface ProjectFormProps {
  /** Omit to create a new project. */
  project?: Project;
  saving: boolean;
  onSave: (input: ProjectUpdateInput) => void;
  onCancel: () => void;
}

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

/** Case-study details: title, location, year, category, story and cover. */
export function ProjectForm({
  project,
  saving,
  onSave,
  onCancel,
}: ProjectFormProps) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [location, setLocation] = useState(project?.location ?? '');
  const [year, setYear] = useState(project?.year?.toString() ?? '');
  const [category, setCategory] = useState(project?.category ?? '');
  const [story, setStory] = useState(project?.story ?? '');
  const serverCover = project?.cover_design_id ?? '';
  const [cover, setCover] = useState(serverCover);
  const [seenCover, setSeenCover] = useState(serverCover);
  // Follow the server's cover (e.g. "Set cover") without touching text edits.
  if (seenCover !== serverCover) {
    setSeenCover(serverCover);
    setCover(serverCover);
  }
  // A cover whose image was removed falls back to "First image".
  const validCover = project?.designs.some((d) => d.id === cover) ? cover : '';
  const [error, setError] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    const yearNum = year.trim() ? Number(year) : null;
    if (!trimmed) return setError('Title is required');
    if (
      yearNum !== null &&
      (!Number.isInteger(yearNum) || yearNum < YEAR_MIN || yearNum > YEAR_MAX)
    )
      return setError(`Year must be between ${YEAR_MIN} and ${YEAR_MAX}`);
    setError('');
    onSave({
      title: trimmed,
      location: location.trim() || null,
      year: yearNum,
      category: category.trim() || null,
      story: story.trim() || null,
      ...(project ? { cover_design_id: validCover || null } : {}),
    });
  }

  return (
    <form onSubmit={onSubmit} className={`${CARD_CLS} space-y-4`}>
      <div>
        <label htmlFor="project-title" className="label-text">
          Title
        </label>
        <input
          id="project-title"
          className={INPUT_CLS}
          value={title}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="project-location" className="label-text">
            Location
          </label>
          <input
            id="project-location"
            className={INPUT_CLS}
            value={location}
            maxLength={255}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="project-year" className="label-text">
            Year
          </label>
          <input
            id="project-year"
            type="number"
            className={INPUT_CLS}
            value={year}
            min={YEAR_MIN}
            max={YEAR_MAX}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="project-category" className="label-text">
            Category
          </label>
          <input
            id="project-category"
            className={INPUT_CLS}
            value={category}
            maxLength={100}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="project-story" className="label-text">
          Story
        </label>
        <textarea
          id="project-story"
          className={`${INPUT_CLS} min-h-28`}
          value={story}
          maxLength={10000}
          onChange={(e) => setStory(e.target.value)}
        />
      </div>
      {project && (
        <div>
          <label htmlFor="project-cover" className="label-text">
            Cover image
          </label>
          <select
            id="project-cover"
            className={INPUT_CLS}
            value={validCover}
            onChange={(e) => setCover(e.target.value)}
          >
            <option value="">First image</option>
            {project.designs.map((d, i) => (
              <option key={d.id} value={d.id}>
                {d.title || `Image ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : project ? 'Save project' : 'Create project'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
