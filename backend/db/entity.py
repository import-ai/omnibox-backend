from datetime import datetime
from typing import List

import bcrypt
import shortuuid
from sqlalchemy import JSON, Text, String, DateTime, Enum, select, Index
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, validates

from backend.api.entity import ResourceType, SpaceType
from common.exception import CommonException
from common.trace_info import TraceInfo


class Base(DeclarativeBase):
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def delete(self):
        self.deleted_at = datetime.now()


ENCODE = "utf-8"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(
        String(length=22), primary_key=True, index=True, default=shortuuid.uuid)
    username: Mapped[str] = mapped_column(String(length=32), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(length=128), unique=True, index=True, nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(length=32), nullable=True)
    password: Mapped[str] = mapped_column(String(length=128), nullable=False)

    role: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    api_keys: Mapped[List[dict]] = mapped_column(JSON, nullable=True)

    @validates("password")
    def validate_password(self, key, password):
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    def verify_password(self, password) -> bool:
        return bcrypt.checkpw(password.encode(), self.password.encode())


class APIKey(Base):
    __tablename__ = "api_keys"

    api_key: Mapped[str] = mapped_column(String(length=22), primary_key=True, index=True, default=shortuuid.uuid)
    user_id: Mapped[str] = mapped_column(String(length=22), index=True)

    comment: Mapped[str | None] = mapped_column(String(length=32), nullable=True)

    role: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class UserRole(Base):
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


class Resource(Base):
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
    attrs: Mapped[dict] = mapped_column(JSON, nullable=True)

    @classmethod
    async def get_root_resource(
            cls,
            namespace_id: str, *,
            session: AsyncSession,
            space_type: SpaceType,
            user_id: str | None = None
    ) -> "Resource":
        with session.no_autoflush:
            sql = select(cls).where(
                cls.namespace_id == namespace_id,
                cls.resource_type == "folder",
                cls.deleted_at.is_(None),
                cls.parent_id.is_(None)
            )
            if space_type == "private":
                if user_id is None:
                    raise CommonException(code=400, error="User ID is required")
                sql = sql.where(cls.space_type == "private", cls.user_id == user_id)
            elif space_type == "teamspace":
                sql = sql.where(cls.space_type == "teamspace")
            else:
                raise CommonException(code=400, error="Invalid space type")
            resource_db = (await session.execute(sql)).scalars().first()
            return resource_db

    async def update(self, *, session: AsyncSession, **kwargs) -> dict:
        delta: dict = {}
        for key, value in kwargs.items():
            if getattr(self, key) != value:
                delta[key] = value
                setattr(self, key, value)
        if delta:
            self.updated_at = datetime.now()
            delta["updated_at"] = self.updated_at
            await session.commit()
            await session.refresh(self)
        return delta

    @classmethod
    async def get(cls, resource_id: str, session: AsyncSession) -> "Resource":
        resource: Resource | None = await session.get(cls, resource_id)
        if not resource:
            raise CommonException(code=404, error="Resource not found")
        return resource

    @classmethod
    async def create(
            cls,
            *,
            resource_type: ResourceType,
            namespace_id: str,
            space_type: SpaceType,
            user_id: str,
            session: AsyncSession,
            trace_info: TraceInfo,

            parent_id: str | None = None,
            name: str | None = None,
            content: str | None = None,
            tags: List[str] | None = None,
            attrs: dict | None = None
    ):
        if parent_id:
            parent_resource = await session.get(cls, parent_id)
            if parent_resource.namespace_id != namespace_id or parent_resource.space_type != space_type:
                raise CommonException(code=400, error="Parent resource's namespace & space must be same as resource's")
        else:
            parent_resource = await cls.get_root_resource(
                namespace_id,
                space_type=space_type,
                session=session,
                user_id=user_id
            )

        trace_info.info({"parent_id": parent_resource.resource_id})

        resource_orm = cls(
            namespace_id=namespace_id,
            user_id=user_id,
            parent_id=parent_resource.resource_id,
            resource_type=resource_type,
            name=name,
            space_type=space_type,
            tags=tags,
            content=content,
            attrs=attrs
        )
        session.add(resource_orm)

        parent_resource.child_count += 1

        await session.commit()
        await session.refresh(resource_orm)

        return resource_orm


class Task(Base):
    __tablename__ = "tasks"

    task_id: Mapped[str] = mapped_column(String(length=22), primary_key=True, index=True, default=shortuuid.uuid)
    priority: Mapped[int] = mapped_column(default=0, doc="Bigger with higher priority")

    namespace_id: Mapped[str] = mapped_column(String(length=22))
    user_id: Mapped[str] = mapped_column(String(length=22))

    function: Mapped[str] = mapped_column(Text, nullable=False)
    input: Mapped[dict] = mapped_column(JSON, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=True)

    output: Mapped[dict] = mapped_column(JSON, nullable=True)
    exception: Mapped[dict] = mapped_column(JSON, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    canceled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    concurrency_threshold: Mapped[int] = mapped_column(default=1, doc="Skip the task when concurrency bigger that it")

    __table_args__ = (
        Index(
            "idx_task_ns_pri_s_e_c_time",
            "namespace_id", "priority", "started_at", "ended_at", "canceled_at", "concurrency_threshold"
        ),
    )
