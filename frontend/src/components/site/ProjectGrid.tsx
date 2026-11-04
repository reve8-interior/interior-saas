import { ArrowUpRight } from 'lucide-react';
import type { PublicProject } from '@/lib/schemas/site';
import { SiteImage } from './SiteImage';
import {
  SECTION_IDS,
  hasText,
  projectCoverSrc,
  projectMeta,
  projectRooms,
} from './siteUtils';

interface ProjectGridProps {
  projects: PublicProject[];
  onOpen: (projectId: string) => void;
}

/** "Selected work": the first project is featured full width, the rest sit in a two-up grid. */
export function ProjectGrid({ projects, onOpen }: ProjectGridProps) {
  return (
    <section
      id={SECTION_IDS.projects}
      aria-labelledby="site-projects-title"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-8 sm:py-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.28em] text-accent-text">
            Selected work
          </p>
          <h2
            id="site-projects-title"
            className="mt-3 font-display text-4xl font-light tracking-tight sm:text-5xl"
          >
            Projects
          </h2>
        </div>
        <p className="text-sm text-muted">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </p>
      </div>

      <ul className="mt-12 grid gap-x-8 gap-y-16 md:grid-cols-2">
        {projects.map((p, i) => (
          <li key={p.id} className={i === 0 ? 'md:col-span-2' : undefined}>
            <ProjectCard
              project={p}
              featured={i === 0}
              onOpen={() => onOpen(p.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ProjectCardProps {
  project: PublicProject;
  featured: boolean;
  onOpen: () => void;
}

function ProjectCard({ project, featured, onOpen }: ProjectCardProps) {
  const meta = projectMeta(project);
  const rooms = projectRooms(project);
  const count = project.designs.length;
  const openable = count > 0;

  const image = (
    <SiteImage
      src={projectCoverSrc(project)}
      alt={project.title}
      className={`rounded-md ${featured ? 'aspect-[4/3] md:aspect-[21/9]' : 'aspect-[4/3]'}`}
      imgClassName="motion-safe:transition-transform motion-safe:duration-[900ms] motion-safe:ease-out motion-safe:group-hover:scale-[1.04]"
    />
  );

  const body = (
    <div className="mt-5 grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] font-medium uppercase tracking-[0.2em] text-faint">
        {hasText(project.category) && (
          <span className="text-accent-text">{project.category}</span>
        )}
        {hasText(project.category) && meta && (
          <span aria-hidden className="h-px w-6 bg-line-strong" />
        )}
        {meta && <span>{meta}</span>}
      </div>
      <h3
        className={`font-display font-light tracking-tight text-text ${featured ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'}`}
      >
        {project.title}
      </h3>
      {hasText(project.story) && (
        <p className="line-clamp-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
          {project.story}
        </p>
      )}
      {rooms.length > 0 && (
        <p className="text-xs text-faint">{rooms.join(' · ')}</p>
      )}
      {openable && (
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 border-b border-text/30 pb-0.5 text-sm font-medium text-text transition-colors group-hover:border-accent-text group-hover:text-accent-text">
          View project
          <span className="text-faint">
            ({count} {count === 1 ? 'image' : 'images'})
          </span>
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </span>
      )}
    </div>
  );

  // Without designs there is nothing to page through, so the card is plain content, not a button.
  if (!openable) {
    return (
      <article aria-label={project.title}>
        {image}
        {body}
      </article>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${project.title}`}
      aria-haspopup="dialog"
      className="group block w-full text-left"
    >
      {image}
      {body}
    </button>
  );
}
