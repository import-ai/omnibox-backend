from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, get_trace_info
from backend.api.entity import Task
from backend.wizard.tasks.base import BaseProcessor
from backend.wizard.tasks.collect import CollectProcessor
from common.trace_info import TraceInfo


router_tasks = APIRouter(prefix="/tasks")

processors: dict[str, BaseProcessor] = {
    "collect": CollectProcessor()
}

@router_tasks.post("/callback", tags=["Tasks"])
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
