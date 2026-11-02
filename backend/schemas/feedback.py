from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FeedbackOption(BaseModel):
    value: str
    label: str


class FeedbackPrompt(BaseModel):
    """One feature's question, as the popup shows it."""

    feature: str
    title: str
    question: str
    choice_question: str
    options: list[FeedbackOption]


class FeedbackCreate(BaseModel):
    feature: str = Field(max_length=32)
    rating: int = Field(ge=1, le=5)
    choice: str | None = Field(default=None, max_length=48)


class FeedbackSaved(BaseModel):
    feature: str


class ChoiceCount(BaseModel):
    value: str
    label: str
    count: int


class FeatureFeedback(BaseModel):
    feature: str
    title: str
    count: int
    avg_rating: float
    choices: list[ChoiceCount]


class FeedbackEntry(BaseModel):
    id: UUID
    created_at: datetime
    feature: str
    title: str
    rating: int
    choice_label: str | None
    user_email: str | None
    business_name: str | None


class AdminFeedback(BaseModel):
    total: int
    avg_rating: float
    features: list[FeatureFeedback]
    recent: list[FeedbackEntry]
