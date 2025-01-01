import json
from typing import Iterator, List
from tests.helper.fixture import client

import httpx
import pytest

from tests.test_server import create_test_data


def assert_stream(stream: Iterator[str]):
    for each in stream:
        response = json.loads(each)
        response_type = response["response_type"]
        assert response_type != "error"
        if response_type == "delta":
            print(response["delta"], end="", flush=True)
        elif response_type == "citation_list":
            print("\n".join(["", "-" * 32, json.dumps(response["citation_list"], ensure_ascii=False)]))
        elif response_type == "done":
            pass
        else:
            raise RuntimeError(f"response_type: {response['response_type']}")


def api_stream(client: httpx.Client, request: dict) -> Iterator[str]:
    with client.stream("POST", "/api/v1/grimoire/stream", json=request) as response:
        for line in response.iter_lines():
            if line.startswith("data: "):
                yield line[6:]


@pytest.mark.parametrize("query, resource_ids, parent_ids", [("有哪些文档？", None, None)])
def test_grimoire_stream(client: httpx.Client, query: str, resource_ids: List[str] | None, parent_ids: List[str] | None):
    create_test_data(client)
    request = dict(session_id="fake_id", query=query, namespace="test")
    assert_stream(api_stream(client, request))
