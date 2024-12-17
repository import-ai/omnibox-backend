from datetime import datetime
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Text

import shortuuid
from sqlalchemy import DateTime, JSON, Text, String, Index, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass

class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(Enum("document", "link", "file", name="resource_type"))
    namespace_id: Mapped[str] = mapped_column(String, nullable=False)
    directory_id: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # Comma-separated tags
    space: Mapped[str] = mapped_column(Enum("private", "teamspace", name="resource_space"))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)  # For links or content
