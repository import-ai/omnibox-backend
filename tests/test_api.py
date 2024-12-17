import httpx
from backend.common.logger import get_logger
from tests.helper.fixture import base_url

logger = get_logger("tests")

async def test_resources(base_url: str):
    # 使用异步 HTTP 客户端
    async with httpx.AsyncClient(base_url=base_url) as client:
        # Step 1: 创建资源
        create_payload = {
            "name": "foo",
            "resource_type": "doc",
            "namespace_id": "fake_ns_id",
            "space": "private"
        }
        create_response = await client.post("/resources", json=create_payload)
        assert create_response.status_code == 201
        resource = create_response.json()
        resource_id = resource.get("resource_id")
        assert resource["name"] == create_payload["name"]
        assert resource["resource_type"] == create_payload["resource_type"]
        assert resource["namespace_id"] == create_payload["namespace_id"]
        assert resource["space"] == create_payload["space"]
        logger.info({"message": "Resource created successfully", "resource": resource})

        # Step 2: 获取资源列表
        list_response = await client.get(f"/resources?namespace_id={create_payload['namespace_id']}")
        assert list_response.status_code == 200
        resource_list = list_response.json()
        assert any(res["resource_id"] == resource_id for res in resource_list)
        logger.info({"message": "Resource list fetched successfully", "resource_list": resource_list})

        # Step 3: 获取单个资源
        get_response = await client.get(f"/resources/{resource_id}")
        assert get_response.status_code == 200
        fetched_resource = get_response.json()
        assert fetched_resource["resource_id"] == resource_id
        assert fetched_resource["name"] == create_payload["name"]
        logger.info({"message": "Resource fetched successfully", "resource": fetched_resource})


        # Step 4: 更新资源
        update_payload = {"name": "updated_name"}
        update_response = await client.patch(f"/resources/{resource_id}", json=update_payload | {"space": create_payload["space"]})
        assert update_response.status_code == 200
        updated_resource = update_response.json()
        assert updated_resource == update_payload
        logger.info({"message": "Resource updated successfully", "resource": updated_resource})

        # Step 4.1: 验证更新
        get_response = await client.get(f"/resources/{resource_id}")
        assert get_response.status_code == 200
        fetched_resource = get_response.json()
        assert fetched_resource["name"] == update_payload["name"]
        assert fetched_resource["space"] == create_payload["space"]
        logger.info({"message": "Resource update confirmed", "resource": fetched_resource})

        # Step 5: 删除资源
        delete_response = await client.delete(f"/resources/{resource_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["resource_id"] == resource_id
        logger.info({"message": "Resource deleted successfully", "resource_id": resource_id})

        # Step 6: 验证资源已删除
        not_found_response = await client.get(f"/resources/{resource_id}")
        assert not_found_response.status_code == 404
        logger.info({"message": "Resource deletion confirmed"})
