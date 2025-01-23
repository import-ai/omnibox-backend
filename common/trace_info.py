from logging import Logger
from typing import Optional

import shortuuid

from common.logger import get_logger


class TraceInfo:
    def __init__(self, trace_id: Optional[str] = None, logger: Optional[Logger] = None, payload: Optional[dict] = None):
        self.trace_id = trace_id or shortuuid.uuid()
        self.logger = logger or get_logger("app")
        self._payload: dict = payload or {}

    @property
    def payload(self) -> dict:
        return self._payload | {"trace_id": self.trace_id}

    def get_child(self, name: str = None, addition_payload: Optional[dict] = None) -> "TraceInfo":
        return self.__class__(
            self.trace_id,
            self.logger if name is None else self.logger.getChild(name),
            self.payload | (addition_payload or {})
        )

    def bind(self, **kwargs) -> "TraceInfo":
        return self.__class__(
            self.trace_id,
            self.logger,
            self.payload | kwargs
        )

    def debug(self, payload: dict):
        self.logger.debug(self.payload | payload, stacklevel=2)

    def info(self, payload: dict):
        self.logger.info(self.payload | payload, stacklevel=2)

    def warning(self, payload: dict):
        self.logger.warning(self.payload | payload, stacklevel=2)

    def error(self, payload: dict):
        self.logger.error(self.payload | payload, stacklevel=2)

    def exception(self, payload: dict):
        self.logger.exception(self.payload | payload, stacklevel=2)

    def __setitem__(self, key, value):
        self._payload = self._payload | {key: value}
