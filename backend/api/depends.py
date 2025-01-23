from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import entity as db
from backend.db import session_context
from common.exception import CommonException
from common.trace_info import TraceInfo


def get_trace_info(
        request: Request,
        x_trace_id: Annotated[str | None, Header()] = None,
) -> TraceInfo:
    return TraceInfo(trace_id=x_trace_id, payload={"request": {"path": request.url.path, "method": request.method}})


async def get_session() -> AsyncSession:
    async with session_context() as session:
        yield session


def _mock_user() -> db.User:
    return db.User(
        user_id="mock_user_id",
        username="mock_username",
        email="mock_email@example.com",
        nickname="mock_nickname",
        password="mock_password",
        role={},
        api_keys=[]
    )


async def _get_user() -> db.User:
    return _mock_user()


async def _get_user_by_api_key(authorization: Annotated[str | None, Header()] = None,
                               session: AsyncSession = Depends(get_session)) -> db.User:
    if not authorization:
        raise CommonException(code=401, error="Authorization required")
    return _mock_user()
    username, api_key = authorization.split(",")

    with session.no_autoflush:
        query = select(db.User).where(db.User.username == username, db.User.deleted_at.is_(None))
        result = await session.execute(query)
        user: db.User = result.scalar()
        if not user:
            raise CommonException(code=401, error="User not found")

        api_key_query = select(db.APIKey).where(db.APIKey.api_key == api_key, db.APIKey.user_id == user.user_id)
        api_key_result = await session.execute(api_key_query)
        api_key_orm: db.APIKey = api_key_result.scalar()
        if not api_key_orm:
            raise CommonException(code=401, error="Invalid API key")

        return user


async def _get_namespace_by_name(namespace: str, session: AsyncSession = Depends(get_session)) -> db.Namespace:
    with session.no_autoflush:
        query = select(db.Namespace).where(db.Namespace.name == namespace, db.Namespace.deleted_at.is_(None))
        result = await session.execute(query)
        namespace_orm: db.Namespace = result.scalar()
        if not namespace_orm:
            raise CommonException(code=404, error="Namespace not found")
        return namespace_orm


async def _get_resource(resource_id: str, session: AsyncSession = Depends(get_session)) -> db.Resource:
    resource_orm: db.Resource = await db.Resource.get(resource_id, session)
    return resource_orm
