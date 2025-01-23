import asyncio
from concurrent.futures import ThreadPoolExecutor

import httpx
from uvicorn import Config, Server

from backend.api.server import app
from tests.helper.fixture import health_check, config
from tests.test_api import create


def run_server_in_thread(host: str, port: int):
    config = Config(app=app, host=host, port=port, reload=True)
    server = Server(config)
    server.run()


def create_test_data(client: httpx.Client):
    client.post("/api/v1/namespaces", json={"name": "test"}).raise_for_status()

    private_parent = create(payload={
        "name": "private_parent",
        "namespace": "test",
        "space_type": "private",
        "resource_type": "doc",
        "content": "# Hello private parent"
    }, client=client)

    private_child = create(payload={
        "name": "private_child",
        "namespace": "test",
        "space_type": "private",
        "resource_type": "doc",
        "parent_id": private_parent["id"],
        "content": "# Hello private child"
    }, client=client)

    team_parent = create(payload={
        "name": "team_parent",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc",
        "content": "# Hello team parent"
    }, client=client)

    team_child_0 = create(payload={
        "name": "team_child_0",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc",
        "parent_id": team_parent["id"],
        "content": "# Hello team child 0"
    }, client=client)

    team_child_1 = create(payload={
        "name": "team_child_1",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc",
        "parent_id": team_parent["id"],
        "content": "# Hello team child 1"
    }, client=client)

    team_child_1_child_0 = create(payload={
        "name": "team_child_1_child_0",
        "namespace": "test",
        "space_type": "teamspace",
        "resource_type": "doc",
        "parent_id": team_child_1["id"],
        "content": "# Hello team child 1 child 0\n\n> this is a quote\n\n| key | value |\n| --- | --- |\n| foo | bar |\n"
    }, client=client)


async def start_server(config: Config, create_test_data_flag: bool = False):
    base_url = "http://127.0.0.1:8000"
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        server_future = loop.run_in_executor(executor, run_server_in_thread, "0.0.0.0", 8000)
        while not await health_check(base_url):
            await asyncio.sleep(1)
        if create_test_data_flag:
            with httpx.Client(base_url=base_url) as client:
                create_test_data(client)
        await server_future


async def test_server(config: Config):
    await start_server(config, create_test_data_flag=True)


async def test_server_with_remote_db(remote_config: Config):
    await start_server(remote_config, create_test_data_flag=False)
