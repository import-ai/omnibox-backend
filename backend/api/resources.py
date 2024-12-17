from typing import List

from fastapi import Depends, HTTPException, APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session
from backend.db import crud
from backend.entity import ResourceCreate, ResourceUpdate, ResourceResponse

router_resources = APIRouter(prefix="/resources")


@router_resources.post("", response_model=ResourceResponse)
async def create_resource(resource: ResourceCreate, db: AsyncSession = Depends(get_session)):
    return await crud.create_resource(db=db, resource=resource)


# Get resources with optional filtering
@router_resources.get("", response_model=List[ResourceResponse])
async def get_resources(
        namespace_id: str, space: str | None = None, db: AsyncSession = Depends(get_session)
):
    return await crud.get_resources(db=db, namespace_id=namespace_id, space=space)


# Update a resource
@router_resources.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
        resource_id: int, resource: ResourceUpdate, db: AsyncSession = Depends(get_session)
):
    updated = await crud.update_resource(db=db, resource_id=resource_id, resource=resource)
    if not updated:
        raise HTTPException(status_code=404, detail="Resource not found")
    return updated


# Delete a resource
@router_resources.delete("/{resource_id}")
async def delete_resource(resource_id: int, db: AsyncSession = Depends(get_session)):
    success = await crud.delete_resource(db=db, resource_id=resource_id)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"detail": "Resource deleted successfully"}
