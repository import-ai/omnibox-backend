from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.entity import BaseUser
from backend.common.exception import CommonException
from backend.common.trace_info import TraceInfo
from backend.db import session_context
from backend.db.entity import ResourceDB as ResourceDB, Namespace as NamespaceDB


def get_trace_info(trace_id: Annotated[str | None, Header()] = None) -> TraceInfo:
    return TraceInfo(trace_id=trace_id)


async def get_session() -> AsyncSession:
    async with session_context() as session:
        yield session


async def _get_user() -> BaseUser:
    return BaseUser(user_id="0" * 22)


async def _get_namespace_by_name(namespace: str, session: AsyncSession = Depends(get_session)) -> NamespaceDB:
    with session.no_autoflush:
        query = select(NamespaceDB).where(NamespaceDB.name == namespace, NamespaceDB.deleted_at.is_(None))
        result = await session.execute(query)
        namespace_orm: NamespaceDB = result.scalar()
        if not namespace_orm:
            raise CommonException(code=404, error="Namespace not found")
        return namespace_orm


async def _get_resource(resource_id: str, session: AsyncSession = Depends(get_session)) -> ResourceDB:
    resource_orm: ResourceDB = await session.get(ResourceDB, resource_id)  # noqa
    if not resource_orm:
        raise CommonException(code=404, error="Resource not found")
    return resource_orm
