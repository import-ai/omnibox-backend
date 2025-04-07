from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.entity import Task
from backend.db import entity as db
from backend.wizard.client import get_wizard_client
from backend.wizard.tasks.base import BaseProcessor
from common.trace_info import TraceInfo


class CollectProcessor(BaseProcessor):

    async def preprocess(self, input_dict: dict, payload: dict | None, user: db.User, namespace: db.Namespace,
                         session: AsyncSession, trace_info: TraceInfo) -> tuple[dict, dict]:
        space_type = payload["spaceType"]
        url: str = input_dict["url"]
        title: str | None = input_dict.get("title", None) or url
        resource = await db.Resource.create(
            resource_type="link",
            namespace_id=namespace.namespace_id,
            space_type=space_type,
            user_id=user.user_id,
            session=session,
            trace_info=trace_info,
            name=title,
            content="Processing...",
            attrs={"url": url}
        )
        payload["resourceId"] = resource.resource_id
        return input_dict, payload

    async def postprocess(self, task: Task, session: AsyncSession, trace_info: TraceInfo) -> dict:
        payload: dict = task.payload
        resource_id: str = payload["resourceId"]

        if task.exception:
            trace_info.exception({"exception": task.exception})
            resource: db.Resource = await db.Resource.get(resource_id, session)
            delta: dict = await resource.update(session=session, content=task.exception["error"])
        else:
            result: dict = task.output
            markdown: str = result.pop("markdown")
            title: str = result.pop("title")

            trace_info.info({"title": title, "len(markdown)": len(markdown)})

            resource: db.Resource = await db.Resource.get(resource_id, session)
            delta: dict = await resource.update(session=session, name=title, content=markdown, attrs=result)
            await get_wizard_client().index(session=session, trace_info=trace_info, resource=resource)
        delta_without_content: dict = {k: v for k, v in delta.items() if k != "content"}
        trace_info.info({"resource_id": resource.resource_id} | delta_without_content)
        return {"resource_id": resource.resource_id} | delta_without_content
