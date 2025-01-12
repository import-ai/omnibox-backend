from functools import partial
from json import dumps as lib_dumps

from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import _get_user_by_api_key, get_trace_info, _get_namespace_by_name, get_session
from backend.api.entity import Task
from backend.db import entity as db
from backend.db.entity import Namespace
from backend.wizard.client import get_wizard_client
from common.trace_info import TraceInfo

dumps = partial(lib_dumps, ensure_ascii=False, separators=(",", ":"))
tasks_router = APIRouter(prefix="/tasks")


@tasks_router.post("", tags=["Tasks"])
async def create_task(
        request: dict = Body(),
        user: db.User = Depends(_get_user_by_api_key),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    """
    Passthrough the params and call the wizard's task API.
    """
    namespace = request["namespace"]
    namespace_orm: Namespace = await _get_namespace_by_name(namespace, session)
    function: str = request.pop("function")
    payload: dict | None = request.pop("payload", None)

    trace_info.info({
        "namespace_id": namespace_orm.namespace_id,
        "user_id": user.user_id,
    })

    await get_wizard_client().create_task(
        trace_info=trace_info,
        function=function,
        input_dict=request,
        namespace_id=namespace_orm.namespace_id,
        user_id=user.user_id,
        payload=payload
    )


@tasks_router.post("/callback", tags=["Tasks"])
async def task_done_callback(
        task: Task,
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    """
    Process the callback request when a task is done.
    """
    # Log the callback information
    function: str = task.function
    trace_info.info({"task_id": task.task_id, "function": function})

    if function == "collect":
        # Process the html_to_markdown callback
        result: dict = task.output
        markdown_result: dict = result["markdown"]
        extracted_markdown: str = markdown_result["extracted"]
        raw_markdown: str = markdown_result["raw"]
        title: str = result["title"]
        url: str = result["url"]

        payload: dict = task.payload
        space_type = payload["spaceType"]

        # Log the result
        trace_info.info({
            "title": title,
            "len(extracted_markdown)": len(extracted_markdown)
        })

        # Save the markdown content as a resource into the database
        resource = await db.Resource.create(
            resource_type="doc",
            namespace_id=task.namespace_id,
            space_type=space_type,
            user_id=task.user_id,
            session=session,
            trace_info=trace_info,
            name=title,
            content=extracted_markdown,
            attrs={"url": url, "markdown": {"raw": raw_markdown}}
        )

        await get_wizard_client().index(trace_info=trace_info, resource=resource)

        # Log the resource creation
        trace_info.info({
            "resource_id": resource.resource_id,
            "name": resource.name,
            "space_type": resource.space_type,
            "namespace_id": resource.namespace_id,
            "user_id": resource.user_id
        })

    return {"task_id": task.task_id, "function": function}
