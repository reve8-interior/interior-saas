from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProjectBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: str | None = Field(default=None, max_length=255)
    year: int | None = Field(default=None, ge=1900, le=2100)
    category: str | None = Field(default=None, max_length=100)
    story: str | None = Field(default=None, max_length=10000)

    @field_validator("location", "category", "story", mode="after")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None


class ProjectCreate(ProjectBase):
    title: str = Field(min_length=1, max_length=255)

    @field_validator("title", mode="after")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title is required")
        return v


class ProjectUpdate(ProjectBase):
    """Partial update: only the fields sent are changed."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    cover_design_id: UUID | None = None

    @field_validator("title", mode="after")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Title cannot be empty")
        return v


class ProjectDesignRead(BaseModel):
    id: UUID
    title: str | None
    client_id: UUID | None
    position: int | None
    view_url: str | None
    thumb_url: str | None


class ProjectRead(BaseModel):
    id: UUID
    title: str
    location: str | None
    year: int | None
    category: str | None
    story: str | None
    cover_design_id: UUID | None
    position: int
    designs: list[ProjectDesignRead]


class DesignIds(BaseModel):
    design_ids: list[UUID] = Field(max_length=200)


class ProjectOrder(BaseModel):
    ids: list[UUID] = Field(max_length=200)


class DesignLibraryItem(BaseModel):
    id: UUID
    title: str | None
    thumb_url: str | None
    client_name: str | None
    project_id: UUID | None
