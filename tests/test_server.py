import asyncio
from concurrent.futures import ThreadPoolExecutor

import httpx
from uvicorn import Config, Server

from backend.api.server import app
from tests.helper.fixture import db_url, health_check, base_url
from tests.test_api import create


def run_server_in_thread(host: str, port: int):
    config = Config(app=app, host=host, port=port, reload=True)
    server = Server(config)
    server.run()


async def create_test_data(base_url: str):
    client = httpx.Client(base_url=base_url)
    client.post("/api/v1/namespaces", json={"name": "test"}).raise_for_status()

    private_parent = create(payload={
        "name": "private_parent",
        "namespace": "test",
        "space_type": "private",
        "resource_type": "doc"
    }, client=client)

    private_child = create(payload={
        "name": "private_child",
        "namespace": "test",
        "space_type": "private",
        "resource_type": "doc",
        "parent_id": private_parent["id"]
    }, client=client)

    team_parent = create(payload={
        "name": "team_parent",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc"
    }, client=client)

    team_child = create(payload={
        "name": "team_child",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc",
        "parent_id": team_parent["id"]
    }, client=client)


async def test_server(db_url: str):
    base_url = "http://127.0.0.1:8000"
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        server_future = loop.run_in_executor(executor, run_server_in_thread, "127.0.0.1", 8000)
        while not await health_check(base_url):
            await asyncio.sleep(1)
        await create_test_data(base_url)
        await server_future
