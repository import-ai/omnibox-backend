import os
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine


def _get_database_url() -> str:
    if url := os.getenv("DB_URL", None):
        return url
    else:
        username = os.environ["DB_USER"]
        password = os.environ["DB_PASS"]
        host = os.environ["DB_HOST"]
        port = os.environ["DB_PORT"]
        db_name = os.environ["DB_NAME"]
        return f"postgresql+asyncpg://{username}:{password}@{host}:{port}/{db_name}"


def get_engine() -> AsyncEngine:
    return create_async_engine(_get_database_url())


def get_session_factory() -> async_sessionmaker:
    engine = get_engine()
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


_session_factory: async_sessionmaker = ...


@asynccontextmanager
async def session_context() -> AsyncSession:
    global _session_factory
    if _session_factory is ...:
        _session_factory = get_session_factory()
    async with _session_factory() as session:
        yield session
