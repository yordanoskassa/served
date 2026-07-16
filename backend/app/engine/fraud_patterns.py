import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel


class FraudPattern(BaseModel):
    id: str
    title: str
    description: str
    detection_hint: str
    source_name: str
    source_url: str
    official_quote: str


@lru_cache
def load_fraud_patterns() -> dict[str, FraudPattern]:
    path = Path(__file__).resolve().parents[1] / "corpus" / "ftc-patterns.json"
    items = [FraudPattern.model_validate(item) for item in json.loads(path.read_text())]
    return {item.id: item for item in items}
