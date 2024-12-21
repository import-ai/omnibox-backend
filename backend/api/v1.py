from datetime import datetime

from fastapi import APIRouter

from backend.api.resources import router_resources
from backend.api.namespaces import router_namespaces

start_time: datetime = datetime.now()
router_api_v1 = APIRouter(prefix="/api/v1")
router_api_v1.include_router(router_resources)
router_api_v1.include_router(router_namespaces)


@router_api_v1.get("/health")
async def health():
    return {"status": 200, "uptime": str(datetime.now() - start_time)}


