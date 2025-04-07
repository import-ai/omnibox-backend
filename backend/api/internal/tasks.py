from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, desc, asc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_session, get_trace_info
from backend.api.entity import Task
from backend.db.entity import Task as ORMTask
from backend.wizard.tasks.base import BaseProcessor
from backend.wizard.tasks.collect import CollectProcessor
from common.exception import CommonException
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

    # Update ORM Task
    orm_task = await session.get(ORMTask, task.task_id)
    if orm_task:
        orm_task.updated_at = task.updated_at
        orm_task.ended_at = task.ended_at
        orm_task.exception = task.exception
        orm_task.output = task.output
        session.add(orm_task)
        await session.commit()
    else:
        await session.rollback()

    trace_info.info({"function": function, "cost": cost, "wait": wait})

    if processor := processors.get(function, None):
        postprocess_result: dict = await processor.postprocess(task, session, trace_info)
    else:
        postprocess_result: dict = {}

    return {"task_id": task.task_id, "function": function} | postprocess_result


@router_tasks.get("/fetch", tags=["Tasks"])
async def fetch_task(
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
) -> Optional[Task]:
    task: Optional[Task] = None
    try:
        async with session.begin():
            # Subquery to count running tasks per user
            running_tasks_sub_query = (
                select(
                    ORMTask.namespace_id,
                    func.count(ORMTask.task_id).label('running_count')
                )
                .where(ORMTask.started_at != None, ORMTask.ended_at == None, ORMTask.canceled_at == None)
                .group_by(ORMTask.namespace_id)
                .subquery()
            )

            # Subquery to find one eligible task_id that can be started
            task_id_subquery = (
                select(ORMTask.task_id)
                .outerjoin(running_tasks_sub_query,
                           ORMTask.namespace_id == running_tasks_sub_query.c.namespace_id)
                .where(ORMTask.started_at == None)
                .where(ORMTask.canceled_at == None)
                .where(
                    func.coalesce(running_tasks_sub_query.c.running_count, 0) < ORMTask.concurrency_threshold)
                .order_by(desc(ORMTask.priority), asc(ORMTask.created_at))
                .limit(1)
                .subquery()
            )

            # Actual query to lock the task row
            stmt = (
                select(ORMTask)
                .where(ORMTask.task_id.in_(select(task_id_subquery.c.task_id)))
                .with_for_update(skip_locked=True)
            )

            result = await session.execute(stmt)
            orm_task = result.scalars().first()

            if orm_task:
                # Mark the task as started
                orm_task.started_at = datetime.now()
                session.add(orm_task)
                task = Task.model_validate(orm_task)
                await session.commit()
    except IntegrityError:  # Handle cases where the task was claimed by another worker
        await session.rollback()
    except Exception as e:
        trace_info.exception({"error": CommonException.parse_exception(e)})
        await session.rollback()
    return task
