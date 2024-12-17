from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from backend.api.v1 import router_api_v1
from backend.common.exception import CommonException
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
app.add_middleware(
    CORSMiddleware,  # noqa
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.exception_handler(Exception)
async def exception_handler(_: Request, e: Exception) -> Response:
    if isinstance(e, CommonException):
        return JSONResponse(status_code=e.code, content={"code": e.code, "error": e.error})
    return JSONResponse(status_code=500, content={"code": 500, "error": CommonException.parse_exception(e)})


app.include_router(router_api_v1)
