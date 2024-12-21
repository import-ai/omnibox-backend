from typing import Optional, List, Literal

from pydantic import BaseModel as _BaseModel, Field, ConfigDict

ResourceType = Literal["doc", "link", "file", "folder"]
SpaceType = Literal["private", "teamspace"]


def to_camel(name: str) -> str:
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class BaseAPIModel(_BaseModel):
    model_config: ConfigDict = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)  # noqa


class IDResponse(BaseAPIModel):
    id: str


class BaseResource(BaseAPIModel):
    name: Optional[str] = Field(default=None)
    resource_type: Optional[ResourceType] = Field(default=None)
    namespace: Optional[str] = Field(default=None)
    space_type: Optional[SpaceType] = Field(default=None)
    parent_id: Optional[str] = Field(default=None)
    tags: Optional[List[str]] = Field(default=None)
    content: Optional[str] = Field(default=None)


class ResourceCreateRequest(BaseResource):
    resource_type: ResourceType
    namespace: str
    space_type: SpaceType


class Resource(BaseResource):
    resource_id: Optional[str] = Field(default=None, alias="id")
    child_count: Optional[int] = Field(default=None)


class BaseUser(BaseAPIModel):
    user_id: Optional[str] = Field(default=None, alias="id")
    username: Optional[str] = Field(default=None)
