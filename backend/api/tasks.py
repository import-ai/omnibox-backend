from functools import partial
from json import dumps as lib_dumps
from typing import Annotated, List

from fastapi import APIRouter, Depends, Body
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import _get_user_by_api_key, get_trace_info, _get_namespace_by_name, get_session
from backend.api.entity import Task
from backend.db import entity as db
from backend.db.entity import Namespace
from backend.db.entity import Task as ORMTask
from backend.wizard.client import get_wizard_client
from backend.wizard.tasks.base import BaseProcessor
from backend.wizard.tasks.collect import CollectProcessor
from common.exception import CommonException
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
        session=session,
        trace_info=trace_info,
        function=function,
        input_dict=input_dict,
        namespace_id=namespace_orm.namespace_id,
        user_id=user.user_id,
        payload=payload
    )


@tasks_router.post("", response_model=Task, response_model_include={"task_id"})
async def create_task(
        task: Task,
        session: Annotated[AsyncSession, Depends(get_session)],
        trace_info: Annotated[TraceInfo, Depends(get_trace_info)]
):
    orm_task = ORMTask(**task.model_dump())
    session.add(orm_task)
    await session.commit()
    trace_info.info({"task_id": orm_task.task_id})
    return JSONResponse(task.model_dump(include={"task_id"}), 201)


@tasks_router.get("", response_model=List[Task], response_model_exclude={"input", "output"},
                  response_model_exclude_none=True)
async def list_tasks(
        session: Annotated[AsyncSession, Depends(get_session)],
        trace_info: Annotated[TraceInfo, Depends(get_trace_info)],
        namespace_id: str,
        offset: int = 0,
        limit: int = 10,
):
    result = await session.execute(
        select(ORMTask).where(ORMTask.namespace_id == namespace_id).offset(offset).limit(limit))
    orm_task_list = result.scalars().all()
    trace_info.info({"task_count": len(orm_task_list), "namespace_id": namespace_id})
    task_list: List[Task] = []
    for orm_task in orm_task_list:
        task: Task = Task.model_validate(orm_task)
        task_list.append(task)
    return task_list


@tasks_router.get("/{task_id}", response_model=Task, response_model_exclude_none=True)
async def get_task(task_id: str, session: Annotated[AsyncSession, Depends(get_session)]):
    result = await session.execute(select(ORMTask).where(ORMTask.task_id == task_id))
    orm_task = result.scalar_one_or_none()

    if orm_task is None:
        raise CommonException(404, f"Task {task_id} not found")
    return Task.model_validate(orm_task)


@tasks_router.delete("/{task_id}")
async def delete_task(
        task_id: str,
        session: Annotated[AsyncSession, Depends(get_session)],
        trace_info: Annotated[TraceInfo, Depends(get_trace_info)]
):
    result = await session.execute(select(ORMTask).where(ORMTask.task_id == task_id))
    orm_task = result.scalar_one_or_none()

    if orm_task is None:
        raise CommonException(404, f"Task {task_id} not found")

    await session.delete(orm_task)
    await session.commit()

    trace_info.info({"task_id": task_id})
    return {"detail": "Task deleted"}
