from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.db.models import Resource
from backend.entity import ResourceCreate, ResourceUpdate


async def create_resource(db: AsyncSession, resource: ResourceCreate) -> Resource:
    db_resource = Resource(
        name=resource.name,
        type=resource.type,
        namespace_id=resource.namespace_id,
        directory_id=resource.directory_id,
        tags=",".join(resource.tags),
        space=resource.space,
        content=resource.content,
    )
    db.add(db_resource)
    await db.commit()
    await db.refresh(db_resource)
    return db_resource


async def get_resources(
        db: AsyncSession, namespace_id: str, space: Optional[str] = None
) -> List[Resource]:
    query = select(Resource).where(Resource.namespace_id == namespace_id)
    if space:
        query = query.where(Resource.space == space)
    result = await db.execute(query)
    return result.scalars().all()


async def update_resource(
        db: AsyncSession, resource_id: int, resource: ResourceUpdate
) -> Optional[Resource]:
    result = await db.get(Resource, resource_id)
    if not result:
        return None
    for key, value in resource.dict(exclude_unset=True).items():
        if key == "tags":
            value = ",".join(value)
        setattr(result, key, value)
    await db.commit()
    await db.refresh(result)
    return result


async def delete_resource(db: AsyncSession, resource_id: int) -> bool:
    resource = await db.get(Resource, resource_id)
    if resource:
        await db.delete(resource)
        await db.commit()
        return True
    return False
