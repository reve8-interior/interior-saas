from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core import get_db
from ..models.user import User
from ..schemas.feedback import FeedbackCreate, FeedbackPrompt, FeedbackSaved
from ..services import feedback_service
from .deps import get_current_user

router = APIRouter()


@router.get("/next", response_model=FeedbackPrompt | None)
def next_feedback_prompt(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A feature the caller has not rated yet, or null when none is left."""
    return feedback_service.next_prompt(db, user)


@router.post("", response_model=FeedbackSaved, status_code=201)
def submit_feedback(
    body: FeedbackCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        row = feedback_service.save_feedback(db, user, body)
    except feedback_service.InvalidFeedback as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return FeedbackSaved(feature=row.feature)
