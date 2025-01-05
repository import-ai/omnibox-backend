from datetime import datetime
from typing import List

import httpx
from fastapi import Depends, APIRouter, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, _get_user, _get_resource, _get_namespace_by_name, get_trace_info
from backend.api.entity import Resource, ResourceType, SpaceType, BaseUser, ResourceCreateRequest, IDResponse
from backend.config import Config
from backend.db.entity import ResourceDB as ResourceDB, Namespace as NamespaceDB
from common.exception import CommonException
from common.trace_info import TraceInfo

router_resources = APIRouter(prefix="/resources", tags=["resources"])
context: dict = {}


def init(config: Config):
    context["wizard_base_url"] = config.wizard.base_url


async def get_root_resource(namespace_id: str, *, session: AsyncSession, space_type: SpaceType,
                            user_id: str | None = None) -> ResourceDB:
    with session.no_autoflush:
        sql = select(ResourceDB).where(
            ResourceDB.namespace_id == namespace_id,
            ResourceDB.resource_type == "folder",
            ResourceDB.deleted_at.is_(None),
            ResourceDB.parent_id.is_(None)
        )
        if space_type == "private":
            if user_id is None:
                raise CommonException(code=400, error="User ID is required")
            sql = sql.where(ResourceDB.space_type == "private", ResourceDB.user_id == user_id)
        elif space_type == "teamspace":
            sql = sql.where(ResourceDB.space_type == "teamspace")
        else:
            raise CommonException(code=400, error="Invalid space type")
        resource_db = (await session.execute(sql)).scalars().first()
        return resource_db


async def create_index_task(resource: ResourceDB, trace_info: TraceInfo):
    async with httpx.AsyncClient(base_url=context["wizard_base_url"]) as client:
        response: httpx.Response = await client.post("/api/v1/tasks", json={
            "function": "create_or_update_index",
            "input": {
                "title": resource.name,
                "content": resource.content,
                "meta_info": {
                    "user_id": resource.user_id,
                    "space_type": resource.space_type,
                    "resource_id": resource.resource_id,
                    "parent_id": resource.parent_id,
                },
            },
            "namespace_id": resource.namespace_id,
            "user_id": resource.user_id
        })
        assert response.is_success, response.text
        task_id = response.json()["task_id"]
        trace_info.info({"task_id": task_id})


@router_resources.post("", response_model=Resource, status_code=201,
                       response_model_exclude_none=True)
async def create_resource(
        resource: ResourceCreateRequest,
        user: BaseUser = Depends(_get_user),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    namespace_id = (await _get_namespace_by_name(resource.namespace, session)).namespace_id
    if parent_id := resource.parent_id:
        parent_resource = await session.get(ResourceDB, parent_id)
        if parent_resource.namespace_id != namespace_id or parent_resource.space_type != resource.space_type:
            raise CommonException(code=400, error="Parent resource's namespace & space must be same as resource's")
    else:
        parent_resource = await get_root_resource(
            namespace_id,
            space_type=resource.space_type,
            session=session,
            user_id=user.user_id
        )

    resource_orm = ResourceDB(
        namespace_id=namespace_id,
        user_id=user.user_id,
        parent_id=parent_resource.resource_id,  # noqa
        **resource.model_dump(exclude_none=True, by_alias=False, exclude={"namespace", "parent_id"})
    )
    session.add(resource_orm)

    parent_resource.child_count += 1

    await session.commit()
    await session.refresh(resource_orm)
    await create_index_task(resource_orm, trace_info)
    created_resource = Resource.model_validate(resource_orm)
    created_resource.namespace = resource.namespace
    return created_resource


@router_resources.get("", response_model=List[Resource],
                      response_model_exclude_none=True, response_model_exclude={"content"})
async def get_resources(
        space_type: SpaceType = Query(alias="spaceType"),
        resource_type: ResourceType | None = Query(alias="resourceType", default=None),
        parent_id: str | None = Query(alias="parentId", default=None),
        tag: str | None = None,
        user: BaseUser = Depends(_get_user),
        namespace_orm: NamespaceDB = Depends(_get_namespace_by_name),
        session: AsyncSession = Depends(get_session)
):
    query = select(ResourceDB).where(
        ResourceDB.deleted_at.is_(None),
        ResourceDB.namespace_id == namespace_orm.namespace_id,
        ResourceDB.space_type == space_type
    )
    if resource_type:
        query = query.where(ResourceDB.resource_type == resource_type)
    if parent_id:
        parent_id_list = parent_id.split(",")
    else:  # 如果没有指定 parent_id，那么默认拉取根目录
        if space_type == "private":
            root = await get_root_resource(
                namespace_orm.namespace_id,
                space_type="private",
                session=session,
                user_id=user.user_id
            )
        elif space_type == "teamspace":
            root = await get_root_resource(
                namespace_orm.namespace_id,
                space_type="teamspace",
                session=session
            )
        else:
            raise CommonException(code=400, error="Invalid space type")
        parent_id_list = [root.resource_id]
    query = query.where(ResourceDB.parent_id.in_(parent_id_list))
    if tag:
        tags = tag.split(",")
        query = query.where(ResourceDB.tags.overlap(tags))

    result = await session.execute(query)
    resource_list: List[ResourceDB] = []
    for resource in result.scalars():
        resource_list.append(Resource.model_validate(resource))
    return resource_list


@router_resources.get("/{resource_id}", response_model=Resource, response_model_exclude_none=True)
async def get_resource_by_id(resource_orm: ResourceDB = Depends(_get_resource),
                             session: AsyncSession = Depends(get_session)):
    namespace_db = await session.get(NamespaceDB, resource_orm.namespace_id)
    resource = Resource.model_validate(resource_orm)
    resource.namespace = namespace_db.name  # noqa
    return resource


@router_resources.patch("/{resource_id}", response_model=Resource, response_model_exclude_none=True)
async def update_resource_by_id(
        resource_patch: Resource,
        resource_orm: ResourceDB = Depends(_get_resource),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    raw_resource = Resource.model_validate(resource_orm).model_dump()
    delta_dict: dict = {}
    for key, value in resource_patch.model_dump(exclude_none=True).items():
        if raw_resource.get(key, None) != value:
            setattr(resource_orm, key, value)
            delta_dict[key] = value
    if delta_dict:
        resource_orm.updated_at = datetime.now()
        delta_dict["updated_at"] = resource_orm.updated_at
        delta_resource = Resource.model_validate(delta_dict)
        await session.commit()
        await session.refresh(resource_orm)
        await create_index_task(resource_orm, trace_info)
        return delta_resource
    return Resource.model_validate({})


@router_resources.delete("/{resource_id}", response_model=IDResponse)
async def delete_resource(
        resource_id: str,
        resource_orm: ResourceDB = Depends(_get_resource),
        session: AsyncSession = Depends(get_session)
):
    parent_resource = await session.get(ResourceDB, resource_orm.parent_id)
    parent_resource.child_count -= 1

    await session.delete(resource_orm)
    await session.commit()
    return IDResponse(id=resource_id)
