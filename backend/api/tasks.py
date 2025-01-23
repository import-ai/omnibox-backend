from functools import partial
from json import dumps as lib_dumps

from fastapi import APIRouter, Depends, Body
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import _get_user_by_api_key, get_trace_info, _get_namespace_by_name, get_session
from backend.api.entity import Task
from backend.db import entity as db
from backend.db.entity import Namespace
from backend.wizard.client import get_wizard_client
from backend.wizard.tasks.base import BaseProcessor
from backend.wizard.tasks.collect import CollectProcessor
from common.trace_info import TraceInfo

dumps = partial(lib_dumps, ensure_ascii=False, separators=(",", ":"))
tasks_router = APIRouter(prefix="/tasks")
processors: dict[str, BaseProcessor] = {
    "collect": CollectProcessor()
}


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

    if processor := processors.get(function, None):
        input_dict, payload = await processor.preprocess(request, payload, user, namespace_orm, session, trace_info)
    else:
        input_dict = request

    trace_info.info({
        "namespace_id": namespace_orm.namespace_id,
        "user_id": user.user_id,
    })

    await get_wizard_client().create_task(
        trace_info=trace_info,
        function=function,
        input_dict=input_dict,
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
    function: str = task.function
    trace_info = trace_info.bind(task_id=task.task_id)

    cost: float = round((task.ended_at - task.started_at).total_seconds(), 3)
    wait: float = round((task.started_at - task.created_at).total_seconds(), 3)

    trace_info.info({"function": function, "cost": cost, "wait": wait})

    if processor := processors.get(function, None):
        postprocess_result: dict = await processor.postprocess(task, session, trace_info)
    else:
        postprocess_result: dict = {}

    return {"task_id": task.task_id, "function": function} | postprocess_result
