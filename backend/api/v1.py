from datetime import datetime

from fastapi import APIRouter

from backend.api.namespaces import router_namespaces
from backend.api.resources import router_resources
from backend.api.tasks import tasks_router
from backend.api.wizard import wizard_router

start_time: datetime = datetime.now()
router_api_v1 = APIRouter(prefix="/api/v1")
router_api_v1.include_router(router_resources)
router_api_v1.include_router(router_namespaces)
router_api_v1.include_router(wizard_router)

router_api_v1.include_router(tasks_router)


@router_api_v1.get("/health", tags=["metrics"])
async def health():
    return {"status": 200, "uptime": str(datetime.now() - start_time)}
