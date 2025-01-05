from functools import partial
from json import dumps as lib_dumps
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_trace_info, _get_namespace_by_name, get_session
from backend.api.resources import context
from backend.db.entity import Namespace
from common.trace_info import TraceInfo

dumps = partial(lib_dumps, ensure_ascii=False, separators=(",", ":"))
grimoire_router = APIRouter(prefix="/grimoire")


async def api_stream(request: dict) -> AsyncIterator[str]:
    prefix: str = "data:"
    async with httpx.AsyncClient(base_url=context["wizard_base_url"]) as client:
        async with client.stream("POST", "/api/v1/grimoire/stream", json=request) as response:
            assert response.is_success, f"{response.status_code} {response.text}"
            async for line in response.aiter_lines():
                if line.startswith(prefix):
                    yield line + "\n\n"


@grimoire_router.post("/stream", tags=["LLM"], response_model=dict)
async def stream(
        request: dict = Body(),
        session: AsyncSession = Depends(get_session),
        trace_info: TraceInfo = Depends(get_trace_info)
):
    """
    Answer the query based on user's database.
    """
    namespace = request["namespace"]
    namespace_orm: Namespace = await _get_namespace_by_name(namespace, session)
    request["namespace_id"] = namespace_orm.namespace_id
    trace_info.info({"namespace": namespace, "namespace_id": namespace_orm.namespace_id})
    return StreamingResponse(api_stream(request), media_type="text/event-stream")
