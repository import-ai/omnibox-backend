import httpx
import pytest
from pydantic.alias_generators import to_camel

from common.exception import CommonException
from common.logger import get_logger
from tests.helper.fixture import client

logger = get_logger("tests")


def get(resource_id: str, client: httpx.Client) -> dict:
    get_response = client.get(f"/api/v1/resources/{resource_id}")
    assert get_response.status_code == 200
    fetched_resource = get_response.json()
    return fetched_resource


def create(payload: dict, client: httpx.Client) -> dict:
    create_response = client.post("/api/v1/resources", json=payload)
    assert create_response.status_code == 201
    resource = create_response.json()
    resource_id = resource["id"]

    resource = get(resource_id, client)
    check(payload, resource)
    assert resource["id"] == resource_id
    assert resource["childCount"] == 0
    return resource


def delete(resource_id: str, client: httpx.Client):
    # Delete child
    delete_response = client.delete(f"/api/v1/resources/{resource_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == resource_id

    # Verify deletion
    with pytest.raises(CommonException) as exc_info:
        client.get(f"/api/v1/resources/{resource_id}")
    assert exc_info.value.code == 404


def check(payload: dict, result: dict):
    for key in payload:
        assert payload[key] == result[to_camel(key)]


def test_resources(namespace: str, client: httpx.Client):
    # Create parent
    create_payload = {
        "name": "foo",
        "content": "bar",
        "resourceType": "doc",
        "namespace": namespace,
        "spaceType": "private"
    }
    parent = create(create_payload, client)

    # Create child
    create_child_payload = {
        "name": "bar",
        "content": "foo",
        "resourceType": "doc",
        "namespace": namespace,
        "spaceType": "private",
        "parent_id": parent["id"]
    }
    child = create(create_child_payload, client)
    assert child["parentId"] == parent["id"]

    # Validate parent's child count
    assert get(parent["id"], client)["childCount"] == 1

    # Fetch resource list
    list_response = client.get(f"/api/v1/resources", params={
        "namespace": namespace, "spaceType": "private"
    })
    assert list_response.status_code == 200
    resource_list = list_response.json()
    assert len(resource_list) == 1
    assert resource_list[0]["id"] == parent["id"]

    # Fetch resource list
    list_response = client.get("/api/v1/resources", params={
        "namespace": namespace, "spaceType": "private", "parentId": parent["id"]
    })
    assert list_response.status_code == 200
    resource_list = list_response.json()
    assert len(resource_list) == 1
    assert resource_list[0]["id"] == child["id"]

    # Fetch empty resource list
    empty_list_response = client.get(f"/api/v1/resources", params={"namespace": namespace, "spaceType": "teamspace"})
    assert empty_list_response.status_code == 200
    assert empty_list_response.json() == []

    # Patch
    update_payload = {"name": "updated_name"}
    update_response = client.patch(
        f"/api/v1/resources/{parent['id']}", json=update_payload | {"spaceType": create_payload["spaceType"]})
    assert update_response.status_code == 200
    updated_resource = update_response.json()
    assert updated_resource == update_payload

    # Validate patch
    fetched_resource = get(parent["id"], client)
    assert fetched_resource["name"] == update_payload["name"]
    assert fetched_resource["spaceType"] == create_payload["spaceType"]

    delete(child["id"], client)
    assert get(parent["id"], client)["childCount"] == 0

    delete(parent["id"], client)
