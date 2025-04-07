from pydantic import BaseModel, Field


class DBConfig(BaseModel):
    url: str = Field(examples=["postgresql+asyncpg://{username}:{password}@{host}:{port}/{db_name}"])


class WizardConfig(BaseModel):
    base_url: str


class Config(BaseModel):
    db: DBConfig
    wizard: WizardConfig


ENV_PREFIX: str = "OBB"
