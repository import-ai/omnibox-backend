from typing import List
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status
from backend.api.depends import get_session
from backend.db.entity import UserDB
from pydantic import BaseModel

router_users = APIRouter(prefix="/users", tags=["users"])

# Pydantic models for request validation
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserUpdate(BaseModel):
    username: str = None
    email: str = None
    password: str = None

# CRUD
@router_users.get("", response_model=List[UserDB])
async def get_users(session: AsyncSession = Depends(get_session)):
    """
    Get all users
    """
    result = await session.execute(select(UserDB))
    return result.scalars().all()

@router_users.post("", response_model=UserDB, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate, session: AsyncSession = Depends(get_session)):
    """
    Create a new user
    """
    new_user = UserDB(**user.model_dump(exclude_none=True))
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    return new_user

@router_users.patch("/{user_id}", response_model=UserDB)
async def update_user(
        user_id: int,
        user: UserUpdate,
        session: AsyncSession = Depends(get_session)
):
    """
    Update an existing user
    """
    result = await session.execute(select(UserDB).where(UserDB.namespace_id == user_id))
    existing_user = result.scalar_one_or_none()

    if not existing_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    for key, value in user.dict(exclude_unset=True).items():
        setattr(existing_user, key, value)

    await session.commit()
    await session.refresh(existing_user)
    return existing_user

@router_users.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, session: AsyncSession = Depends(get_session)):
    """
    Delete a user
    """
    result = await session.execute(select(UserDB).where(UserDB.namespace_id == user_id))
    existing_user = result.scalar_one_or_none()

    if not existing_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await session.execute(delete(UserDB).where(UserDB.namespace_id == user_id))
    await session.commit()
