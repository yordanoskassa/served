import json
from hashlib import sha256
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class FraudPattern(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    title: str
    description: str
    detection_hint: str
    source_name: str
    source_url: str
    official_quote: str
    # Fail closed: a future corpus entry that omits this field is annotation-only.
    counts_toward_verdict: bool = False


def _corpus_path() -> Path:
    return Path(__file__).resolve().parents[1] / "corpus" / "ftc-patterns.json"


@lru_cache
def load_fraud_patterns() -> dict[str, FraudPattern]:
    items = [
        FraudPattern.model_validate(item)
        for item in json.loads(_corpus_path().read_text())
    ]
    if len(items) != len({item.id for item in items}):
        raise ValueError("FTC pattern corpus contains duplicate IDs")
    return {item.id: item for item in items}


@lru_cache
def fraud_pattern_corpus_version() -> str:
    """Stable provenance marker for the exact corpus used by a run."""
    return f"sha256:{sha256(_corpus_path().read_bytes()).hexdigest()[:16]}"
