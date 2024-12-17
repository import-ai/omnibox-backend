from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api.v1 import router_api_v1
from backend.db import session_context
from backend.db.models import Base


async def init():
    async with session_context() as session:
        async with session.bind.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(router_api_v1)
