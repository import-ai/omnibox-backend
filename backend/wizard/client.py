from typing import AsyncIterator

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import Config
from backend.db import entity as db
from backend.db.entity import Task as ORMTask
from common.trace_info import TraceInfo


class WizardClient:
    def __init__(self, config: Config):
        self.base_url = config.wizard.base_url

    async def api_stream(self, request: dict) -> AsyncIterator[str]:
        prefix: str = "data:"
        async with httpx.AsyncClient(base_url=self.base_url) as client:
            async with client.stream("POST", "/api/v1/grimoire/stream", json=request) as response:
                assert response.is_success, f"{response.status_code} {response.text}"
                async for line in response.aiter_lines():
                    if line.startswith(prefix):
                        yield line + "\n\n"

    @classmethod
    async def create_task(
            cls,
            session: AsyncSession,
            trace_info: TraceInfo,
            function: str,
            input_dict: dict,
            namespace_id: str,
            user_id: str,
            payload: dict | None = None
    ) -> None:
        orm_task = ORMTask(**{
            "function": function,
            "input": input_dict,
            "namespace_id": namespace_id,
            "user_id": user_id,
            "payload": payload
        })
        session.add(orm_task)
        await session.commit()
        trace_info.info({"task_id": orm_task.task_id})

    async def index(self, session: AsyncSession, trace_info: TraceInfo, resource: db.Resource):
        if not (resource.resource_type != "folder" and resource.content):
            return
        await self.create_task(
            session=session,
            trace_info=trace_info,
            function="create_or_update_index",
            input_dict={
                "title": resource.name,
                "content": resource.content,
                "meta_info": {
                    "user_id": resource.user_id,
                    "space_type": resource.space_type,
                    "resource_id": resource.resource_id,
                    "parent_id": resource.parent_id,
                },
            },
            namespace_id=resource.namespace_id,
            user_id=resource.user_id
        )

    async def delete_index(self, session: AsyncSession, trace_info: TraceInfo, resource: db.Resource):
        await self.create_task(
            session=session,
            trace_info=trace_info,
            function="delete_index",
            input_dict={
                "resource_id": resource.resource_id,
            },
            namespace_id=resource.namespace_id,
            user_id=resource.user_id
        )


_wizard_client: WizardClient = ...


def init(config: Config):
    global _wizard_client
    _wizard_client = WizardClient(config)


def get_wizard_client() -> WizardClient:
    return _wizard_client


__all__ = ["WizardClient", "get_wizard_client", "init"]
