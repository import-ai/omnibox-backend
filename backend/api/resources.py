import asyncio
from typing import List

from fastapi import Depends, APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, _get_user, _get_resource, _get_namespace_by_name
from backend.api.entity import Resource, ResourceType, SpaceType, BaseUser, ResourceCreateRequest, IDResponse
from backend.common.exception import CommonException
from backend.db.entity import ResourceDB as ResourceDB, Namespace as NamespaceDB

router_resources = APIRouter(prefix="/resources")


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


@router_resources.post("", response_model=IDResponse, status_code=201, tags=["resources"],
                       response_model_exclude_none=True,
                       response_model_include={"id", "name", "resourceType", "space", "parentId", "childCount"})
async def create_resource(
        resource: ResourceCreateRequest,
        user: BaseUser = Depends(_get_user),
        session: AsyncSession = Depends(get_session)
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
    return IDResponse(id=resource_orm.resource_id)


@router_resources.get("", response_model=List[Resource], tags=["resources"], response_model_exclude_none=True)
async def get_resources(
        space_type: SpaceType | None = None,
        resource_type: ResourceType | None = None,
        parent_id: str | None = None,
        tag: str | None = None,
        user: BaseUser = Depends(_get_user),
        recursive: bool = False,
        namespace_orm: NamespaceDB = Depends(_get_namespace_by_name),
        session: AsyncSession = Depends(get_session)
):
    if recursive:
        raise CommonException(code=400, error="Recursive is not supported")
    query = select(ResourceDB).where(
        ResourceDB.deleted_at.is_(None),
        ResourceDB.namespace_id == namespace_orm.namespace_id
    )
    if space_type:
        query = query.where(ResourceDB.space_type == space_type)
    if resource_type:
        query = query.where(ResourceDB.resource_type == resource_type)
    if parent_id:
        parent_id_list = parent_id.split(",")
    else:  # 如果没有指定 parent_id，那么默认拉取根目录
        private_root, teamspace_root = await asyncio.gather(
            get_root_resource(
                namespace_orm.namespace_id,
                space_type="private",
                session=session,
                user_id=user.user_id
            ),
            get_root_resource(
                namespace_orm.namespace_id,
                space_type="teamspace",
                session=session
            )
        )
        parent_id_list = [private_root.resource_id, teamspace_root.resource_id]
    query = query.where(ResourceDB.parent_id.in_(parent_id_list))
    if tag:
        tags = tag.split(",")
        query = query.where(ResourceDB.tags.overlap(tags))
    if space_type:
        query = query.where(ResourceDB.space_type == space_type)

    result = await session.execute(query)
    resource_list: List[ResourceDB] = []
    for resource in result.scalars():
        resource_list.append(Resource.model_validate(resource))
    return resource_list


@router_resources.get("/{resource_id}", response_model=Resource, tags=["resources"], response_model_exclude_none=True)
async def get_resource_by_id(resource_orm: ResourceDB = Depends(_get_resource),
                             session: AsyncSession = Depends(get_session)):
    namespace_db = await session.get(NamespaceDB, resource_orm.namespace_id)
    resource = Resource.model_validate(resource_orm)
    resource.namespace = namespace_db.name  # noqa
    return resource


@router_resources.patch("/{resource_id}", response_model=Resource, tags=["resources"], response_model_exclude_none=True)
async def update_resource_by_id(
        resource_patch: Resource,
        resource_orm: ResourceDB = Depends(_get_resource),
        session: AsyncSession = Depends(get_session)
):
    raw_resource = Resource.model_validate(resource_orm).model_dump()
    delta_dict: dict = {}
    for key, value in resource_patch.model_dump(exclude_none=True).items():
        if raw_resource.get(key, None) != value:
            setattr(resource_orm, key, value)
            delta_dict[key] = value
    delta_resource = Resource.model_validate(delta_dict)
    await session.commit()
    return delta_resource


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
