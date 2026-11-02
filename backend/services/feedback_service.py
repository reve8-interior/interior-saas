"""Collecting feature feedback and summarising it for the superadmin."""

import random
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.business import Business
from ..models.feedback import Feedback
from ..models.user import User
from ..schemas.feedback import (
    AdminFeedback,
    ChoiceCount,
    FeatureFeedback,
    FeedbackCreate,
    FeedbackEntry,
    FeedbackPrompt,
)
from .feedback_catalog import BY_FEATURE, CATALOG

RECENT_LIMIT = 50


class InvalidFeedback(ValueError):
    """The feature or choice is not in the catalog."""


def next_prompt(db: Session, user: User) -> FeedbackPrompt | None:
    """A random feature this user has not answered yet, or None when done."""
    answered = set(
        db.execute(select(Feedback.feature).where(Feedback.user_id == user.id))
        .scalars()
        .all()
    )
    remaining = [p for p in CATALOG if p.feature not in answered]
    return random.choice(remaining) if remaining else None


def save_feedback(db: Session, user: User, data: FeedbackCreate) -> Feedback:
    """Store the answer; answering a feature again replaces the old one."""
    prompt = BY_FEATURE.get(data.feature)
    if prompt is None:
        raise InvalidFeedback("Unknown feature")
    if data.choice is not None and data.choice not in {
        o.value for o in prompt.options
    }:
        raise InvalidFeedback("Unknown choice for this feature")

    row = db.execute(
        select(Feedback).where(
            Feedback.user_id == user.id, Feedback.feature == data.feature
        )
    ).scalar_one_or_none()
    if row is None:
        row = Feedback(
            id=uuid.uuid4(),
            user_id=user.id,
            business_id=user.business_id,
            feature=data.feature,
        )
        db.add(row)
    row.rating = data.rating
    row.choice = data.choice
    db.commit()
    return row


def get_admin_feedback(db: Session) -> AdminFeedback:
    """Per-feature averages and choice counts, plus the latest answers."""
    total, avg = db.execute(
        select(
            func.count(Feedback.id),
            func.coalesce(func.avg(Feedback.rating), 0),
        )
    ).one()

    per_feature = {
        feature: (count, float(average))
        for feature, count, average in db.execute(
            select(
                Feedback.feature,
                func.count(Feedback.id),
                func.avg(Feedback.rating),
            ).group_by(Feedback.feature)
        )
    }
    choice_counts = {
        (feature, choice): count
        for feature, choice, count in db.execute(
            select(Feedback.feature, Feedback.choice, func.count(Feedback.id))
            .where(Feedback.choice.is_not(None))
            .group_by(Feedback.feature, Feedback.choice)
        )
    }

    features = [
        FeatureFeedback(
            feature=p.feature,
            title=p.title,
            count=per_feature[p.feature][0],
            avg_rating=round(per_feature[p.feature][1], 2),
            choices=[
                ChoiceCount(
                    value=o.value,
                    label=o.label,
                    count=choice_counts.get((p.feature, o.value), 0),
                )
                for o in p.options
            ],
        )
        for p in CATALOG
        if p.feature in per_feature
    ]

    rows = db.execute(
        select(Feedback, User.email, Business.name)
        .outerjoin(User, User.id == Feedback.user_id)
        .outerjoin(Business, Business.id == Feedback.business_id)
        .order_by(Feedback.created_at.desc())
        .limit(RECENT_LIMIT)
    ).all()
    recent = [
        FeedbackEntry(
            id=fb.id,
            created_at=fb.created_at,
            feature=fb.feature,
            title=_title(fb.feature),
            rating=fb.rating,
            choice_label=_choice_label(fb.feature, fb.choice),
            user_email=email,
            business_name=business,
        )
        for fb, email, business in rows
    ]
    return AdminFeedback(
        total=total,
        avg_rating=round(float(avg), 2),
        features=features,
        recent=recent,
    )


def _title(feature: str) -> str:
    prompt = BY_FEATURE.get(feature)
    return prompt.title if prompt else feature


def _choice_label(feature: str, choice: str | None) -> str | None:
    if choice is None:
        return None
    prompt = BY_FEATURE.get(feature)
    if prompt is None:
        return choice
    return next((o.label for o in prompt.options if o.value == choice), choice)
