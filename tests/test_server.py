import uvicorn

from tests.helper.fixture import db_url


def test_server(db_url: str):
    uvicorn.run(app="backend.api.server:app", host="127.0.0.1", port=8000, reload=True)
