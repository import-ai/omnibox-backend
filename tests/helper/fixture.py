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
from backend.config import Config, ENV_PREFIX
from common import project_root
from common.config_loader import Loader
from common.logger import get_logger

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
def postgres_url() -> str:
    driver = "asyncpg"
    with PostgresContainer("postgres:17-alpine", driver=driver) as postgres:
        url = postgres.get_connection_url()
        asyncio.run(check_db(postgres.get_connection_url(driver=None)))

        os.environ[f"{ENV_PREFIX}_DB_URL"] = url
        logger.debug({"db_url": url, "env": {f"{ENV_PREFIX}_DB_URL": os.getenv(f"{ENV_PREFIX}_DB_URL")}})

        yield url


@pytest.fixture(scope="session")
def wizard_base_url() -> str:
    url = "http://127.0.0.1:8001"
    os.environ[f"{ENV_PREFIX}_WIZARD_BASE_URL"] = url
    return url


@pytest.fixture(scope="session")
def config(postgres_url: str, wizard_base_url: str) -> Config:
    loader = Loader(Config, env_prefix=ENV_PREFIX)
    config: Config = loader.load()
    yield config


@pytest.fixture(scope="session")
def client(config: Config) -> str:
    with TestClient(app) as client:
        yield client


async def health_check(base_url: str) -> bool:
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=3) as client:
            response: httpx.Response = await client.get("/api/v1/health")
        response.raise_for_status()
        return True
    except httpx.ConnectError:
        return False


@pytest.fixture(scope="session")
async def base_url(config: Config) -> str:
    base_url = "http://127.0.0.1:8000"

    if not await health_check(base_url):
        env: dict = os.environ.copy()
        cwd: str = project_root.path()

        api_process = subprocess.Popen(["uvicorn", "backend.api:app"], cwd=cwd, env=env)

        while not await health_check(base_url):  # 等待服务起来
            if api_process.poll() is not None:
                raise RuntimeError(f"api_process exit with code {api_process.returncode}")
            time.sleep(1)

        logger.debug({"base_url": base_url, "env": {f"{ENV_PREFIX}_DB_URL": os.getenv(f"{ENV_PREFIX}_DB_URL")}})
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
