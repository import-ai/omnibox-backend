from datetime import datetime
from fastapi import APIRouter
from backend.api.internal.tasks import router_tasks


router_internal = APIRouter(prefix="/internal/api")
router_internal.include_router(router_tasks)

