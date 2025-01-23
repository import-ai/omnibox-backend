from abc import abstractmethod

from sqlalchemy.ext.asyncio import AsyncSession

import backend.db.entity as db
from backend.api.entity import Task
from common.trace_info import TraceInfo


class BaseProcessor:

    @abstractmethod
    async def preprocess(self, request: dict, payload: dict | None, user: db.User, namespace: db.Namespace,
                         session: AsyncSession, trace_info: TraceInfo) -> tuple[dict, dict]:
        raise NotImplementedError

    @abstractmethod
    async def postprocess(self, task: Task, session: AsyncSession, trace_info: TraceInfo) -> dict:
        raise NotImplementedError
