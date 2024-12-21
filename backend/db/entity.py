from datetime import datetime
from typing import List

import shortuuid
from sqlalchemy import JSON, Text, String, DateTime, Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.api.entity import ResourceType, SpaceType


class Base(DeclarativeBase):
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def delete(self):
        self.deleted_at = datetime.now()


class UserDB(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(
        String(length=22), primary_key=True, index=True, default=shortuuid.uuid)
    username: Mapped[str] = mapped_column(String(length=32), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(length=128), unique=True, index=True, nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(length=32), nullable=True)
    password: Mapped[str] = mapped_column(String(length=128), nullable=False)

    role: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class UserRoleDB(Base):
    __tablename__ = "user_roles"
    user_role_id: Mapped[str] = mapped_column(
        String(length=22), primary_key=True, index=True, default=shortuuid.uuid, name="role_id")
    user_id: Mapped[str] = mapped_column(String(length=22), index=True)
    target_id: Mapped[str] = mapped_column(String(length=22), index=True)
    role: Mapped[int] = mapped_column(Enum("owner", "admin", "editor", "viewer", name="role"))


class Namespace(Base):
    __tablename__ = "namespaces"

    namespace_id: Mapped[str] = mapped_column(
        String(length=22), primary_key=True, index=True, default=shortuuid.uuid, name="namespace_id")
    name: Mapped[str] = mapped_column(String(length=32), unique=True, index=True, nullable=False)
    owner_id: Mapped[str] = mapped_column(String(length=22), nullable=False)
    collaborators: Mapped[List[str] | None] = mapped_column(JSON, nullable=True)


class ResourceDB(Base):
    __tablename__ = "resources"

    resource_id: Mapped[str] = mapped_column(
        String(length=22), primary_key=True, index=True, default=shortuuid.uuid, name="resource_id")
    user_id: Mapped[str] = mapped_column(String(length=22), index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    resource_type: Mapped[ResourceType] = mapped_column(Enum("doc", "link", "file", "folder", name="resource_type"))
    namespace_id: Mapped[str] = mapped_column(String(length=22), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(length=22), nullable=True)
    tags: Mapped[List[str] | None] = mapped_column(JSON, nullable=True)
    space_type: Mapped[SpaceType] = mapped_column(Enum("private", "teamspace", name="space_type"))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_count: Mapped[int] = mapped_column(nullable=False, default=0)
