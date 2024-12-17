class CommonException(Exception):
    def __init__(self, code: int, error: str):
        self.code: int = code
        self.error: str = error

    @classmethod
    def parse_exception(cls, e: Exception) -> str:
        return f"{e.__class__.__name__}: {str(e)}"
