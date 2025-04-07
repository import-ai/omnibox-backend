from functools import partial
from json import dumps as lib_dumps
from typing import Annotated, List, Literal

from fastapi import APIRouter, Depends, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import _get_user_by_api_key, get_trace_info, _get_namespace_by_name, get_session
from backend.api.entity import Task, SpaceType
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


class CollectRequest(BaseModel):
    html: str
    url: str
    title: str
    namespace: str
    spaceType: SpaceType


@tasks_router.post("/collect", tags=["Tasks"])
async def collect(
        request: CollectRequest,
        user: db.User = Depends(_get_user_by_api_key),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    """
    Passthrough the params and call the wizard's task API.
    """
    namespace = request.namespace
    namespace_orm: Namespace = await _get_namespace_by_name(namespace, session)
    function: str = "collect"
    payload: dict = {"spaceType": request.spaceType, "namespace": request.namespace}

    processor = CollectProcessor()
    input_dict: dict = request.model_dump(exclude={"namespace", "spaceType"})
    input_dict, payload = await processor.preprocess(input_dict, payload, user, namespace_orm, session, trace_info)

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
