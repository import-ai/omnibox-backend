import httpx
import pytest

from backend.common.exception import CommonException
from backend.common.logger import get_logger
from tests.helper.fixture import client

logger = get_logger("tests")


def test_resources(namespace: str, client: httpx.Client):
    # Step 1: 创建资源
    create_payload = {
        "name": "foo",
        "resource_type": "doc",
        "namespace": namespace,
        "space_type": "private"
    }
    create_response = client.post("/api/v1/resources", json=create_payload)
    assert create_response.status_code == 201
    resource = create_response.json()
    resource_id = resource["id"]
    logger.info({"message": "Resource created successfully", "resource": resource})

    # Step 2: 获取单个资源
    get_response = client.get(f"/api/v1/resources/{resource_id}")
    assert get_response.status_code == 200
    fetched_resource = get_response.json()
    assert fetched_resource["id"] == resource_id
    assert fetched_resource["name"] == create_payload["name"]
    assert fetched_resource["resourceType"] == create_payload["resource_type"]
    assert fetched_resource["namespace"] == create_payload["namespace"]
    assert fetched_resource["spaceType"] == create_payload["space_type"]
    logger.info({"message": "Resource fetched successfully", "resource": fetched_resource})

    # Step 3: 获取资源列表
    list_response = client.get(f"/api/v1/resources", params={"namespace": namespace})
    assert list_response.status_code == 200
    resource_list = list_response.json()
    assert any(res["id"] == resource_id for res in resource_list)
    logger.info({"message": "Resource list fetched successfully", "resource_list": resource_list})

    # Step 3.1: 获取一个空的资源列表
    empty_list_response = client.get(f"/api/v1/resources", params={"namespace": namespace, "space_type": "teamspace"})
    assert empty_list_response.status_code == 200
    assert empty_list_response.json() == []

    # Step 4: 更新资源
    update_payload = {"name": "updated_name"}
    update_response = client.patch(
        f"/api/v1/resources/{resource_id}", json=update_payload | {"space_type": create_payload["space_type"]})
    assert update_response.status_code == 200
    updated_resource = update_response.json()
    assert updated_resource == update_payload
    logger.info({"message": "Resource updated successfully", "resource": updated_resource})

    # Step 4.1: 验证更新
    get_response = client.get(f"/api/v1/resources/{resource_id}")
    assert get_response.status_code == 200
    fetched_resource = get_response.json()
    assert fetched_resource["name"] == update_payload["name"]
    assert fetched_resource["spaceType"] == create_payload["space_type"]
    logger.info({"message": "Resource update confirmed", "resource": fetched_resource})

    # Step 5: 删除资源
    delete_response = client.delete(f"/api/v1/resources/{resource_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["id"] == resource_id
    logger.info({"message": "Resource deleted successfully", "resource_id": resource_id})

    # Step 6: 验证资源已删除
    with pytest.raises(CommonException) as exc_info:
        client.get(f"/api/v1/resources/{resource_id}")
    assert exc_info.value.code == 404
    logger.info({"message": "Resource deletion confirmed"})
