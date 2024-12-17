import httpx

from backend.common.logger import get_logger
from tests.helper.fixture import base_url

logger = get_logger("tests")


async def test_api(base_url: str):
    with httpx.Client(base_url=base_url) as client:
        pass
