import asyncio
import os
import subprocess
import time

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient
from testcontainers.postgres import PostgresContainer

from backend.api.server import app
from backend.common import project_root
from backend.common.logger import get_logger

logger = get_logger("fixture")


async def check_db(dsn: str, retry_cnt: int = 10):
    for attempt in range(retry_cnt):
        try:
            conn = await asyncpg.connect(dsn=dsn)
            await conn.execute('SELECT 1')
            await conn.close()
            return
        except (asyncpg.exceptions.CannotConnectNowError, OSError,
                asyncpg.PostgresError, asyncpg.exceptions.ConnectionDoesNotExistError):
            await asyncio.sleep(1)
    raise RuntimeError("Postgres container failed to become healthy in time.")


@pytest.fixture(scope="session")
def db_url() -> str:
    driver = "asyncpg"
    with PostgresContainer("postgres:17-alpine", driver=driver) as postgres:
        url = postgres.get_connection_url()
        asyncio.run(check_db(postgres.get_connection_url(driver=None)))

        os.environ["DB_URL"] = url
        logger.debug({"db_url": url, "env": {"DB_URL": os.getenv("DB_URL")}})

        yield url


@pytest.fixture(scope="session")
def client(db_url: str) -> str:
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="session")
async def base_url(db_url: str) -> str:
    base_url = "http://127.0.0.1:8000/api/v1"

    def health_check() -> bool:
        try:
            with httpx.Client(base_url=base_url, timeout=3) as client:
                response: httpx.Response = client.get("/health")
            response.raise_for_status()
            return True
        except httpx.ConnectError:
            return False

    if not health_check():
        env: dict = os.environ.copy()
        cwd: str = project_root.path()

        api_process = subprocess.Popen(["uvicorn", "backend.api:app"], cwd=cwd, env=env)

        while not health_check():  # 等待服务起来
            if api_process.poll() is not None:
                raise RuntimeError(f"api_process exit with code {api_process.returncode}")
            time.sleep(1)

        logger.debug({"base_url": base_url, "env": {"DB_URL": os.getenv("DB_URL")}})
        yield base_url

        api_process.terminate()
        api_process.wait()
    else:
        raise RuntimeError("Server already exists")


@pytest.fixture(scope="session")
def namespace(client: httpx.Client) -> str:
    namespace = "pytest"
    client.post("/api/v1/namespaces", json={"name": namespace}).raise_for_status()
    yield namespace
