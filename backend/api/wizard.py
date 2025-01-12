from functools import partial
from json import dumps as lib_dumps

from fastapi import APIRouter, Depends, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.depends import get_trace_info, _get_namespace_by_name, get_session
from backend.db.entity import Namespace
from backend.wizard.client import get_wizard_client
from common.trace_info import TraceInfo

dumps = partial(lib_dumps, ensure_ascii=False, separators=(",", ":"))
wizard_router = APIRouter(prefix="/wizard")


@wizard_router.post("/chat/stream", tags=["LLM"], response_model=dict)
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
    return StreamingResponse(get_wizard_client().api_stream(request), media_type="text/event-stream")
