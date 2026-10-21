"""Which clients a team member can see.

Admins and viewers see every client in their business. Designers see the
clients they lead (`Client.assigned_designer_id`) plus any an admin has
shared with them (`client_access`).
"""

import uuid

from fastapi import HTTPException
from sqlalchemy import ColumnElement, Select, delete, exists, or_, select
from sqlalchemy.orm import Session

from ..core.utils import parse_uuid

from ..models.client import Client
from ..models.client_access import ClientAccess
from ..models.user import User, UserRole
from ..schemas.client import ClientAccessRead, MemberClientsRead
from . import audit


def client_access_clause(user: User) -> ColumnElement[bool]:
    """WHERE clause limiting `Client` rows to those the designer may see."""
    return or_(
        Client.assigned_designer_id == user.id,
        exists().where(
            ClientAccess.client_id == Client.id,
            ClientAccess.user_id == user.id,
        ),
    )


def restrict_to_accessible(q: Select, user: User) -> Select:
    """Limit a query joined to `Client` to rows the user may see.

    Admins and viewers pass through; designers get `client_access_clause`.
    """
    if user.role == UserRole.designer:
        q = q.where(client_access_clause(user))
    return q


def get_client_or_404(client_id: str, db: Session, user: User) -> Client:
    """Load a client the caller may see; 404 hides out-of-scope clients."""
    q = select(Client).where(Client.id == parse_uuid(client_id, "client id"))
    q = restrict_to_accessible(q, user)
    client = db.execute(q).scalars().first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


def _designers(
    user_ids: set[uuid.UUID], business_id: uuid.UUID, db: Session
) -> list[User]:
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    if len(users) != len(user_ids) or any(
        u.business_id != business_id or u.role != UserRole.designer
        for u in users
    ):
        raise HTTPException(
            status_code=422,
            detail="Access can only be granted to designers of this business",
        )
    return list(users)


def _member_ids(client_id: uuid.UUID, db: Session) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(ClientAccess.user_id).where(
                ClientAccess.client_id == client_id
            )
        )
    )


def client_access(client: Client, db: Session) -> ClientAccessRead:
    return ClientAccessRead(
        lead_id=client.assigned_designer_id,
        member_ids=_member_ids(client.id, db),
    )


def set_client_members(
    client: Client,
    member_ids: set[uuid.UUID],
    business_id: uuid.UUID,
    db: Session,
    actor: User,
) -> ClientAccessRead:
    """Replace the designers (besides the lead) who can see this client."""
    member_ids.discard(client.assigned_designer_id)
    if member_ids:
        _designers(member_ids, business_id, db)
    before = set(_member_ids(client.id, db))
    db.execute(delete(ClientAccess).where(ClientAccess.client_id == client.id))
    db.add_all(
        ClientAccess(client_id=client.id, user_id=uid) for uid in member_ids
    )
    if before != member_ids:
        audit.record(
            db,
            actor=actor,
            business_id=business_id,
            action="access.client_updated",
            entity_type="client",
            entity_id=client.id,
            payload={
                "client": client.name,
                "granted": len(member_ids - before),
                "revoked": len(before - member_ids),
            },
        )
    db.commit()
    return client_access(client, db)


def member_clients(user: User, db: Session) -> MemberClientsRead:
    shared = db.scalars(
        select(ClientAccess.client_id).where(ClientAccess.user_id == user.id)
    )
    led = db.scalars(
        select(Client.id).where(Client.assigned_designer_id == user.id)
    )
    return MemberClientsRead(lead_ids=list(led), shared_ids=list(shared))


def set_member_clients(
    user: User,
    client_ids: set[uuid.UUID],
    business_id: uuid.UUID,
    db: Session,
    actor: User,
) -> MemberClientsRead:
    """Replace the clients shared with a designer (clients they lead stay)."""
    if user.role != UserRole.designer:
        raise HTTPException(
            status_code=422,
            detail="Only designers are limited to specific clients",
        )
    if client_ids:
        found = set(
            db.scalars(select(Client.id).where(Client.id.in_(client_ids)))
        )
        if found != client_ids:
            raise HTTPException(status_code=404, detail="Client not found")
    before = set(
        db.scalars(
            select(ClientAccess.client_id).where(
                ClientAccess.user_id == user.id
            )
        )
    )
    db.execute(delete(ClientAccess).where(ClientAccess.user_id == user.id))
    db.add_all(
        ClientAccess(client_id=cid, user_id=user.id) for cid in client_ids
    )
    if before != client_ids:
        audit.record(
            db,
            actor=actor,
            business_id=business_id,
            action="access.member_updated",
            entity_type="user",
            entity_id=user.id,
            payload={
                "email": user.email,
                "granted": len(client_ids - before),
                "revoked": len(before - client_ids),
            },
        )
    db.commit()
    return member_clients(user, db)
