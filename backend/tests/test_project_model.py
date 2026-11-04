"""Project model: designs survive project deletion; RLS isolates projects."""

from sqlalchemy import select

from backend.models.design import Design, DesignSource
from backend.models.project import Project

from .conftest import as_business, as_owner, make_business


def _project(db, business_id, **kw) -> Project:
    project = Project(business_id=business_id, title="Villa", **kw)
    db.add(project)
    db.flush()
    return project


def test_deleting_project_keeps_designs(db):
    biz = make_business(db)
    project = _project(db, biz.id)
    design = Design(
        business_id=biz.id,
        source=DesignSource.designer_uploaded,
        project_id=project.id,
        project_position=0,
    )
    db.add(design)
    db.flush()
    project.cover_design_id = design.id
    db.flush()

    db.delete(project)
    db.flush()
    db.expire_all()

    kept = db.get(Design, design.id)
    assert kept is not None
    assert kept.project_id is None


def test_deleting_cover_design_keeps_project(db):
    biz = make_business(db)
    project = _project(db, biz.id)
    design = Design(
        business_id=biz.id,
        source=DesignSource.designer_uploaded,
        project_id=project.id,
    )
    db.add(design)
    db.flush()
    project.cover_design_id = design.id
    db.flush()

    db.delete(design)
    db.flush()
    db.expire_all()

    assert db.get(Project, project.id).cover_design_id is None


def test_rls_isolates_projects(db):
    biz_a = make_business(db)
    biz_b = make_business(db)
    project = _project(db, biz_a.id)

    as_business(db, biz_b.id)
    assert (
        db.scalars(select(Project).where(Project.id == project.id)).all() == []
    )

    as_owner(db)
    as_business(db, biz_a.id)
    assert db.scalars(
        select(Project.id).where(Project.id == project.id)
    ).all() == [project.id]
