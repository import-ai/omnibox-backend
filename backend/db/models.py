from typing import List

import shortuuid
from sqlalchemy import Enum
from sqlalchemy import JSON, Text, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.entity import ResourceType, SpaceType


class Base(DeclarativeBase):
    pass


class Resource(Base):
    __tablename__ = "resources"

    resource_id: Mapped[str] = mapped_column(String(length=22), primary_key=True, index=True, default=shortuuid.uuid)
    name: Mapped[str] = mapped_column(String, index=True)
    resource_type: Mapped[ResourceType] = mapped_column(Enum("doc", "link", "file", name="resource_type"))
    namespace_id: Mapped[str] = mapped_column(String(length=22), nullable=False)
    directory_id: Mapped[str | None] = mapped_column(String(length=22), nullable=True)
    tags: Mapped[List[str] | None] = mapped_column(JSON, nullable=True)
    space: Mapped[SpaceType] = mapped_column(Enum("private", "teamspace", name="resource_space"))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
