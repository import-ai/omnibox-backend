from typing import Optional, List, Literal

from pydantic import BaseModel, Field, ConfigDict

ResourceType = Literal["doc", "link", "file"]
SpaceType = Literal["private", "teamspace"]

class Resource(BaseModel):
    resource_id: Optional[str] = Field(default=None)
    name: Optional[str] = Field(default=None)
    resource_type: Optional[ResourceType] = Field(default=None)  # doc | link | file
    namespace_id: Optional[str] = Field(default=None)
    directory_id: Optional[str] = Field(default=None)
    tags: Optional[List[str]] = Field(default=None)
    space: Optional[SpaceType] = Field(default=None)
    content: Optional[str] = Field(default=None)

    model_config: ConfigDict = ConfigDict(from_attributes=True)  # noqa
