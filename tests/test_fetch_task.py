import httpx

from tests.helper.fixture import client
from tests.test_server import create_test_data


def test_fetch_task(client: httpx.Client):
    create_test_data(client)
    response = client.get("/internal/api/v1/tasks/fetch")
    print(response.json())
