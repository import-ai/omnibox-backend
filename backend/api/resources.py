from typing import List

from fastapi import Depends, APIRouter, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, _get_user, _get_resource, _get_namespace_by_name, get_trace_info
from backend.api.entity import Resource, ResourceType, SpaceType, ResourceCreateRequest, IDResponse
from backend.db import entity as db
from backend.wizard.client import get_wizard_client
from common.exception import CommonException
from common.trace_info import TraceInfo

router_resources = APIRouter(prefix="/resources", tags=["resources"])


@router_resources.post("", response_model=Resource, status_code=201,
                       response_model_exclude_none=True)
async def create_resource(
        resource: ResourceCreateRequest,
        user: db.User = Depends(_get_user),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    namespace_id = (await _get_namespace_by_name(resource.namespace, session)).namespace_id
    resource_orm: db.Resource = await db.Resource.create(
        resource_type=resource.resource_type,
        namespace_id=namespace_id,
        space_type=resource.space_type,
        user_id=user.user_id,
        session=session,
        trace_info=trace_info,
        parent_id=resource.parent_id,
        name=resource.name,
        content=resource.content,
        tags=resource.tags,
    )

    await get_wizard_client().index(session=session, trace_info=trace_info, resource=resource_orm)
    created_resource = Resource.model_validate(resource_orm)
    created_resource.namespace = resource.namespace
    return created_resource


@router_resources.get("/root", response_model=Resource, response_model_exclude_none=True)
async def get_root_resource(
        space_type: SpaceType = Query(alias="spaceType"),
        user: db.User = Depends(_get_user),
        namespace_orm: db.Namespace = Depends(_get_namespace_by_name),
        session: AsyncSession = Depends(get_session)
):
    resource_orm = await db.Resource.get_root_resource(
        namespace_orm.namespace_id,
        space_type=space_type,
        session=session,
        user_id=user.user_id
    )
    return Resource.model_validate(resource_orm)


@router_resources.get("", response_model=List[Resource],
                      response_model_exclude_none=True, response_model_exclude={"content"})
async def get_resources(
        space_type: SpaceType = Query(alias="spaceType"),
        resource_type: ResourceType | None = Query(alias="resourceType", default=None),
        parent_id: str | None = Query(alias="parentId", default=None),
        tag: str | None = None,
        user: db.User = Depends(_get_user),
        namespace_orm: db.Namespace = Depends(_get_namespace_by_name),
        session: AsyncSession = Depends(get_session)
):
    query = select(db.Resource).where(
        db.Resource.deleted_at.is_(None),
        db.Resource.namespace_id == namespace_orm.namespace_id,
        db.Resource.space_type == space_type
    )
    if resource_type:
        query = query.where(db.Resource.resource_type == resource_type)
    if parent_id:
        parent_id_list = parent_id.split(",")
    else:  # 如果没有指定 parent_id，那么默认拉取根目录
        if space_type == "private":
            root = await db.Resource.get_root_resource(
                namespace_orm.namespace_id,
                space_type="private",
                session=session,
                user_id=user.user_id
            )
        elif space_type == "teamspace":
            root = await db.Resource.get_root_resource(
                namespace_orm.namespace_id,
                space_type="teamspace",
                session=session
            )
        else:
            raise CommonException(code=400, error="Invalid space type")
        parent_id_list = [root.resource_id]
    query = query.where(db.Resource.parent_id.in_(parent_id_list))
    if tag:
        tags = tag.split(",")
        query = query.where(db.Resource.tags.overlap(tags))

    result = await session.execute(query)
    resource_list: List[Resource] = []
    for resource in result.scalars():
        resource_list.append(Resource.model_validate(resource))
    return sorted(resource_list, key=lambda x: x.created_at, reverse=True)


@router_resources.get("/{resource_id}", response_model=Resource, response_model_exclude_none=True)
async def get_resource_by_id(resource_orm: db.Resource = Depends(_get_resource),
                             session: AsyncSession = Depends(get_session)):
    namespace_db = await session.get(db.Namespace, resource_orm.namespace_id)
    resource = Resource.model_validate(resource_orm)
    resource.namespace = namespace_db.name  # noqa
    return resource


@router_resources.patch("/{resource_id}", response_model=Resource, response_model_exclude_none=True)
async def update_resource_by_id(
        partial_resource: Resource,
        resource_orm: db.Resource = Depends(_get_resource),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    delta = await resource_orm.update(session=session, **partial_resource.model_dump(exclude_none=True))
    if delta:
        delta_resource = Resource.model_validate(delta)
        await get_wizard_client().index(session=session, trace_info=trace_info, resource=resource_orm)
        return delta_resource
    return Resource.model_validate({})


@router_resources.delete("/{resource_id}", response_model=IDResponse)
async def delete_resource(
        resource_id: str,
        resource_orm: db.Resource = Depends(_get_resource),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    parent_resource = await session.get(db.Resource, resource_orm.parent_id)
    parent_resource.child_count -= 1

    await session.delete(resource_orm)
    await session.commit()
    await get_wizard_client().delete_index(session=session, trace_info=trace_info, resource=resource_orm)
    return IDResponse(id=resource_id)
