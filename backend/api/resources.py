from typing import List

from fastapi import Depends, APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session
from backend.common.exception import CommonException
from backend.db.models import Resource as ResourceORM
from backend.entity import Resource, ResourceType, SpaceType

router_resources = APIRouter(prefix="/resources")


@router_resources.post("", response_model=Resource, status_code=201, tags=["Resources"],
                       response_model_exclude_none=True)
async def create_resource(resource: Resource, session: AsyncSession = Depends(get_session)):
    resource_orm = ResourceORM(**resource.model_dump(exclude_none=True))
    session.add(resource_orm)
    await session.commit()
    await session.refresh(resource_orm)
    return Resource.model_validate(resource_orm)


# Get resources with optional filtering
@router_resources.get("", response_model=List[Resource], tags=["Resources"], response_model_exclude_none=True)
async def get_resources(
        namespace_id: str,
        resource_type: ResourceType | None = None,
        directory_id: str | None = None,
        tag: str | None = None,
        space: SpaceType | None = None,
        session: AsyncSession = Depends(get_session)
):
    query = select(ResourceORM).where(ResourceORM.namespace_id == namespace_id)
    if resource_type:
        query = query.where(ResourceORM.resource_type == resource_type)
    if space:
        query = query.where(ResourceORM.space == space)
    if directory_id:
        directory_id_list = directory_id.split(",")
        query = query.where(ResourceORM.directory_id.in_(directory_id_list))
    if tag:
        tags = tag.split(",")
        query = query.where(ResourceORM.tags.overlap(tags))
    if space:
        query = query.where(ResourceORM.space == space)
    result = await session.execute(query)
    resource_list: List[ResourceORM] = []
    for resource in result.scalars():
        resource_list.append(Resource.model_validate(resource))
    return resource_list


async def _get_resource(resource_id: str, session: AsyncSession) -> ResourceORM:
    resource_orm: ResourceORM = await session.get(ResourceORM, resource_id)  # noqa
    if not resource_orm:
        raise CommonException(code=404, error="Resource not found")
    return resource_orm


@router_resources.get("/{resource_id}", response_model=Resource, tags=["Resources"], response_model_exclude_none=True)
async def get_resource(resource_id: str, session: AsyncSession = Depends(get_session)):
    return Resource.model_validate(await _get_resource(resource_id, session))


# Update a resource
@router_resources.patch("/{resource_id}", response_model=Resource, tags=["Resources"], response_model_exclude_none=True)
async def update_resource(resource_id: str, resource: Resource, session: AsyncSession = Depends(get_session)):
    resource_orm: ResourceORM = await _get_resource(resource_id, session)
    raw_resource = Resource.model_validate(resource_orm).model_dump()
    delta_dict: dict = {}
    for key, value in resource.model_dump(exclude_none=True).items():
        if raw_resource.get(key, None) != value:
            setattr(resource_orm, key, value)
            delta_dict[key] = value
    delta_resource = Resource.model_validate(delta_dict)
    await session.commit()
    return delta_resource


# Delete a resource
@router_resources.delete("/{resource_id}", response_model=Resource, response_model_include={"resource_id"})
async def delete_resource(resource_id: str, session: AsyncSession = Depends(get_session)):
    resource_orm = await _get_resource(resource_id, session)
    await session.delete(resource_orm)
    await session.commit()
    return Resource.model_validate({"resource_id": resource_id})
