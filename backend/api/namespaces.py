from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, _get_user
from backend.api.entity import IDResponse, BaseAPIModel
from common.exception import CommonException
from backend.db import entity as db

router_namespaces = APIRouter(prefix="/namespaces", tags=["namespaces"])


class NamespaceCreate(BaseAPIModel):
    name: str


class NamespaceResponse(BaseAPIModel):
    name: str
    owner_id: str


# CRUD
@router_namespaces.get("", response_model=List[NamespaceResponse])
async def get_namespaces(
        session: AsyncSession = Depends(get_session),
        user: db.User = Depends(_get_user)
):
    result = await session.execute(select(db.Namespace).where(
        db.Namespace.deleted_at.is_(None),
        or_(db.Namespace.owner_id == user.user_id, db.Namespace.collaborators.any(user.user_id))
    ))
    return result.scalars().all()


@router_namespaces.post("", response_model=IDResponse, status_code=status.HTTP_201_CREATED)
async def create_namespace(
        namespace: NamespaceCreate,
        session: AsyncSession = Depends(get_session),
        user: db.User = Depends(_get_user)
):
    new_namespace_db = db.Namespace(owner_id=user.user_id, **namespace.model_dump())
    session.add(new_namespace_db)

    await session.commit()
    await session.refresh(new_namespace_db)

    parameter = {"namespace_id": new_namespace_db.namespace_id, "user_id": user.user_id, "resource_type": "folder"}

    teamspace_root = db.Resource(space_type="teamspace", **parameter)
    private_root = db.Resource(space_type="private", **parameter)

    session.add(teamspace_root)
    session.add(private_root)
    await session.commit()

    return IDResponse(id=new_namespace_db.namespace_id)


@router_namespaces.delete("/{namespace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_namespace(
        namespace_id: str,
        session: AsyncSession = Depends(get_session),
        user: db.User = Depends(_get_user)
):
    """
    Delete a namespace
    """
    result = await session.execute(select(db.Namespace).where(db.Namespace.namespace_id == namespace_id))
    existing_namespace = result.scalar_one_or_none()

    if not existing_namespace or existing_namespace.owner_id != user.user_id:
        raise CommonException(code=status.HTTP_404_NOT_FOUND, error="Namespace not found")

    await session.execute(delete(db.Namespace).where(db.Namespace.namespace_id == namespace_id))
    await session.commit()
