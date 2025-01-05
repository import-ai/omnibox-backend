from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine


def get_session_factory(dsn: str) -> async_sessionmaker:
    engine: AsyncEngine = create_async_engine(dsn)
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


_session_factory: async_sessionmaker = ...


def set_session_factory(dsn: str):
    global _session_factory
    _session_factory = get_session_factory(dsn)


@asynccontextmanager
async def session_context() -> AsyncSession:
    async with _session_factory() as session:
        yield session
