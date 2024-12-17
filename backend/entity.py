from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

class ResourceBase(BaseModel):
    name: str
    type: str  # document | link | file
    namespace_id: str
    directory_id: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    space: str  # private | teamspace
    content: Optional[str] = None

    model_config: ConfigDict = ConfigDict(from_attributes=True)

class ResourceCreate(ResourceBase):
    pass

class ResourceUpdate(BaseModel):
    name: Optional[str]
    directory_id: Optional[str]
    tags: Optional[List[str]]
    space: Optional[str]

class ResourceResponse(ResourceBase):
    id: int

