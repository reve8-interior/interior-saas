"""Designer website: case-study projects that group design images."""

import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.business import Business
from ..models.client import Client
from ..models.design import Design
from ..models.project import Project
from ..models.user import User
from ..schemas.project import (
    DesignIds,
    DesignLibraryItem,
    ProjectCreate,
    ProjectDesignRead,
    ProjectOrder,
    ProjectRead,
    ProjectUpdate,
)
from ..services.design_images import delete_design_objects, store_design_image
from ..services.image_quota import ensure_can_upload
from ..services.site_access import site_mode
from .deps import require_business_admin
from ..services.portfolio import design_thumb_url, design_view_url

router = APIRouter()


def any_plan_business(
    db: Session = Depends(get_db),
    user: User = Depends(require_business_admin),
) -> Business:
    """The caller's business on any plan.

    Used by list/delete/detach so a downgraded business can still view and
    remove project images (they count toward its image limit).
    """
    business = db.get(Business, user.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def paid_business(
    business: Business = Depends(any_plan_business),
    db: Session = Depends(get_db),
) -> Business:
    """The caller's business; creating/editing projects needs a website plan."""
    if site_mode(db, business) != "site":
        raise HTTPException(
            status_code=403, detail="Projects need a plan with a website"
        )
    return business


def _project_designs(db: Session, project_id: uuid.UUID) -> list[Design]:
    return list(
        db.execute(
            select(Design)
            .where(Design.project_id == project_id)
            .order_by(Design.project_position.asc(), Design.created_at.asc())
        )
        .scalars()
        .all()
    )


def _design_read(design: Design) -> ProjectDesignRead:
    return ProjectDesignRead(
        id=design.id,
        title=design.title,
        client_id=design.client_id,
        position=design.project_position,
        view_url=design_view_url(design),
        thumb_url=design_thumb_url(design),
    )


def _read(project: Project, designs: list[Design]) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        title=project.title,
        location=project.location,
        year=project.year,
        category=project.category,
        story=project.story,
        cover_design_id=project.cover_design_id,
        position=project.position,
        designs=[_design_read(d) for d in designs],
    )


def _read_one(db: Session, project: Project) -> ProjectRead:
    return _read(project, _project_designs(db, project.id))


def _project_or_404(
    db: Session, business: Business, project_id: uuid.UUID
) -> Project:
    project = db.execute(
        select(Project)
        .where(Project.id == project_id)
        .where(Project.business_id == business.id)
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _next_design_position(db: Session, project_id: uuid.UUID) -> int:
    top = db.scalar(
        select(func.max(Design.project_position)).where(
            Design.project_id == project_id
        )
    )
    return 0 if top is None else top + 1


def _clear_cover(db: Session, design: Design) -> None:
    """Un-cover the design's current project so the cover never goes stale."""
    if design.project_id is None:
        return
    owner = db.get(Project, design.project_id)
    if owner is not None and owner.cover_design_id == design.id:
        owner.cover_design_id = None


def _release(db: Session, design: Design) -> str | None:
    """Take a design out of its project.

    A client-less design is unreachable elsewhere (and still counts toward the
    image limit), so it is deleted; returns its storage path for cleanup.
    """
    if design.client_id is None:
        path = design.storage_path
        db.delete(design)
        return path
    _clear_cover(db, design)
    design.project_id = None
    design.project_position = None
    return None


LIBRARY_LIMIT = 500


# Literal path before /projects/{id} routes so "library" is never an id.
@router.get("/projects/library", response_model=list[DesignLibraryItem])
def design_library(
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    """Every design of the business with an image, for the project picker."""
    rows = db.execute(
        select(Design, Client.name)
        .outerjoin(Client, Client.id == Design.client_id)
        .where(Design.business_id == business.id)
        .where(
            or_(
                Design.storage_path.is_not(None), Design.image_url.is_not(None)
            )
        )
        .order_by(Design.created_at.desc())
        .limit(LIBRARY_LIMIT)
    ).all()
    return [
        DesignLibraryItem(
            id=d.id,
            title=d.title,
            thumb_url=design_thumb_url(d),
            client_name=name,
            project_id=d.project_id,
        )
        for d, name in rows
    ]


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    business: Business = Depends(any_plan_business),
):
    projects = (
        db.execute(
            select(Project)
            .where(Project.business_id == business.id)
            .order_by(Project.position.asc(), Project.created_at.asc())
        )
        .scalars()
        .all()
    )
    by_project: dict[uuid.UUID, list[Design]] = {p.id: [] for p in projects}
    if projects:
        rows = (
            db.execute(
                select(Design)
                .where(Design.project_id.in_(list(by_project)))
                .order_by(
                    Design.project_position.asc(), Design.created_at.asc()
                )
            )
            .scalars()
            .all()
        )
        for d in rows:
            by_project[d.project_id].append(d)
    return [_read(p, by_project[p.id]) for p in projects]


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    top = db.scalar(
        select(func.max(Project.position)).where(
            Project.business_id == business.id
        )
    )
    project = Project(
        business_id=business.id,
        position=0 if top is None else top + 1,
        **body.model_dump(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _read(project, [])


# Literal path first so "order" is never parsed as a project id.
@router.put("/projects/order", status_code=204)
def set_projects_order(
    body: ProjectOrder,
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    wanted = list(dict.fromkeys(body.ids))
    found = {
        p.id: p
        for p in db.execute(
            select(Project)
            .where(Project.business_id == business.id)
            .where(Project.id.in_(wanted))
        )
        .scalars()
        .all()
    }
    if set(found) != set(wanted):
        raise HTTPException(status_code=404, detail="Project not found")
    for position, project_id in enumerate(wanted):
        found[project_id].position = position
    db.commit()
    return Response(status_code=204)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    project = _project_or_404(db, business, project_id)
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is None:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    cover = changes.get("cover_design_id")
    if cover is not None:
        owned = db.scalar(
            select(Design.id)
            .where(Design.id == cover)
            .where(Design.project_id == project.id)
        )
        if owned is None:
            raise HTTPException(
                status_code=422, detail="Cover must be a design in the project"
            )
    for field, value in changes.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _read_one(db, project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    business: Business = Depends(any_plan_business),
):
    project = _project_or_404(db, business, project_id)
    paths: list[str] = []
    for design in _project_designs(db, project.id):
        path = _release(db, design)
        if path:
            paths.append(path)
    db.flush()
    db.delete(project)
    db.commit()
    for path in paths:
        delete_design_objects(path)
    return Response(status_code=204)


@router.post("/projects/{project_id}/designs", response_model=ProjectRead)
def attach_designs(
    project_id: uuid.UUID,
    body: DesignIds,
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    """Attach existing designs; a design moves out of any other project."""
    project = _project_or_404(db, business, project_id)
    wanted = list(dict.fromkeys(body.design_ids))
    found = {
        d.id: d
        for d in db.execute(
            select(Design)
            .where(Design.business_id == business.id)
            .where(Design.id.in_(wanted))
        )
        .scalars()
        .all()
    }
    if set(found) != set(wanted):
        raise HTTPException(status_code=404, detail="Design not found")
    position = _next_design_position(db, project.id)
    for design_id in wanted:
        design = found[design_id]
        if design.project_id != project.id:
            _clear_cover(db, design)
        design.project_id = project.id
        design.project_position = position
        position += 1
    db.commit()
    return _read_one(db, project)


@router.put("/projects/{project_id}/designs/order", status_code=204)
def set_designs_order(
    project_id: uuid.UUID,
    body: DesignIds,
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    project = _project_or_404(db, business, project_id)
    wanted = list(dict.fromkeys(body.design_ids))
    found = {d.id: d for d in _project_designs(db, project.id)}
    if not set(wanted) <= set(found):
        raise HTTPException(status_code=404, detail="Design not found")
    # Unlisted designs follow the listed ones in their current order.
    rest = [i for i in found if i not in set(wanted)]
    for position, design_id in enumerate(wanted + rest):
        found[design_id].project_position = position
    db.commit()
    return Response(status_code=204)


@router.delete("/projects/{project_id}/designs/{design_id}", status_code=204)
def detach_design(
    project_id: uuid.UUID,
    design_id: uuid.UUID,
    db: Session = Depends(get_db),
    business: Business = Depends(any_plan_business),
):
    project = _project_or_404(db, business, project_id)
    design = db.execute(
        select(Design)
        .where(Design.id == design_id)
        .where(Design.project_id == project.id)
    ).scalar_one_or_none()
    if design is None:
        raise HTTPException(status_code=404, detail="Design not found")
    path = _release(db, design)
    db.commit()
    delete_design_objects(path)
    return Response(status_code=204)


@router.post(
    "/projects/{project_id}/upload",
    response_model=ProjectDesignRead,
    status_code=201,
)
def upload_project_image(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=255),
    db: Session = Depends(get_db),
    business: Business = Depends(paid_business),
):
    """Upload an image straight into the project as a client-less design."""
    project = _project_or_404(db, business, project_id)
    ensure_can_upload(business, db)
    design = store_design_image(
        db,
        business,
        None,
        file,
        title,
        None,
        project_id=project.id,
        project_position=_next_design_position(db, project.id),
    )
    return _design_read(design)
