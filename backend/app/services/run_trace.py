"""Per-analysis trace collection with optional live event delivery.

The trace intentionally records observable workflow state, tool outcomes, and
usage metadata. It never records hidden model reasoning.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from time import perf_counter
from typing import Any
from uuid import uuid4

from app.schemas.analysis import (
    AnalysisRunTrace,
    DecisionTrace,
    ModelUsage,
    RunMetrics,
    TraceEvent,
    TraceKind,
    TraceStatus,
)

TraceEmitter = Callable[[TraceEvent], Awaitable[None] | None]
logger = logging.getLogger(__name__)


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


class RunTraceCollector:
    def __init__(
        self,
        *,
        model_alias: str,
        prompt_versions: dict[str, str],
        corpus_version: str,
        policy_version: str,
        corpus_versions: dict[str, str] | None = None,
        emit: TraceEmitter | None = None,
    ) -> None:
        self.run_id = str(uuid4())
        self.started_at = _iso_now()
        self.model_alias = model_alias
        self.prompt_versions = prompt_versions
        self.corpus_version = corpus_version
        self.corpus_versions = corpus_versions or {"ftc_patterns": corpus_version}
        self.policy_version = policy_version
        self.pattern_text_basis = "model_assisted_transcription"
        self._emit = emit
        self._run_started = perf_counter()
        self._active: dict[str, float] = {}
        self._events: list[TraceEvent] = []
        self._model_usage: list[ModelUsage] = []
        self._model_calls = 0
        self._tool_calls = 0
        self._seq = 0

    async def _publish(self, event: TraceEvent) -> None:
        if self._emit is None:
            return
        try:
            outcome = self._emit(event.model_copy(deep=True))
            if inspect.isawaitable(outcome):
                await outcome
        except Exception:
            # Telemetry must never change the document result or verdict.
            logger.exception("Analysis trace emitter failed")

    def _event(
        self,
        *,
        key: str,
        kind: TraceKind,
        status: TraceStatus,
        label: str,
        parent_key: str | None = None,
        parallel_group: str | None = None,
        duration_ms: int | None = None,
        detail: str | None = None,
        input_summary: str | None = None,
        output_summary: str | None = None,
        evidence_count: int = 0,
        evidence_ids: list[str] | None = None,
        decision: DecisionTrace | None = None,
    ) -> TraceEvent:
        self._seq += 1
        return TraceEvent(
            run_id=self.run_id,
            seq=self._seq,
            at=_iso_now(),
            key=key,
            kind=kind,
            status=status,
            label=label,
            parent_key=parent_key,
            parallel_group=parallel_group,
            duration_ms=duration_ms,
            detail=detail,
            input_summary=input_summary,
            output_summary=output_summary,
            evidence_count=evidence_count,
            evidence_ids=evidence_ids or [],
            decision=decision,
        )

    async def start(
        self,
        *,
        key: str,
        kind: TraceKind,
        label: str,
        parent_key: str | None = None,
        parallel_group: str | None = None,
        detail: str | None = None,
        input_summary: str | None = None,
    ) -> None:
        self._active[key] = perf_counter()
        event = self._event(
            key=key,
            kind=kind,
            status="started",
            label=label,
            parent_key=parent_key,
            parallel_group=parallel_group,
            detail=detail,
            input_summary=input_summary,
        )
        self._events.append(event)
        await self._publish(event)

    async def finish(
        self,
        *,
        key: str,
        kind: TraceKind,
        status: TraceStatus,
        label: str,
        parent_key: str | None = None,
        parallel_group: str | None = None,
        detail: str | None = None,
        input_summary: str | None = None,
        output_summary: str | None = None,
        evidence_count: int = 0,
        evidence_ids: list[str] | None = None,
        decision: DecisionTrace | None = None,
    ) -> TraceEvent:
        started = self._active.pop(key, self._run_started)
        event = self._event(
            key=key,
            kind=kind,
            status=status,
            label=label,
            parent_key=parent_key,
            parallel_group=parallel_group,
            duration_ms=max(0, round((perf_counter() - started) * 1000)),
            detail=detail,
            input_summary=input_summary,
            output_summary=output_summary,
            evidence_count=evidence_count,
            evidence_ids=evidence_ids,
            decision=decision,
        )
        self._events.append(event)
        await self._publish(event)
        return event

    def add_model_usage(
        self,
        *,
        stage: str,
        model: str,
        response_id: str | None,
        input_tokens: int | None,
        output_tokens: int | None,
        total_tokens: int | None,
    ) -> None:
        self._model_usage.append(
            ModelUsage(
                stage=stage,
                model=model,
                response_id=response_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            )
        )

    def record_model_call(self) -> None:
        self._model_calls += 1

    def record_tool_call(self) -> None:
        self._tool_calls += 1

    def build(
        self,
        *,
        evidence_items: int,
        signal_reviews: list[Any],
    ) -> AnalysisRunTrace:
        completed_at = _iso_now()
        total_duration_ms = max(0, round((perf_counter() - self._run_started) * 1000))
        input_values = [item.input_tokens for item in self._model_usage]
        output_values = [item.output_tokens for item in self._model_usage]
        total_values = [item.total_tokens for item in self._model_usage]
        usage_complete = len(self._model_usage) == self._model_calls

        def summed(values: list[int | None]) -> int | None:
            if not values or any(value is None for value in values):
                return None
            return sum(value for value in values if value is not None)

        return AnalysisRunTrace(
            run_id=self.run_id,
            started_at=self.started_at,
            completed_at=completed_at,
            model_alias=self.model_alias,
            prompt_versions=self.prompt_versions,
            corpus_version=self.corpus_version,
            corpus_versions=dict(self.corpus_versions),
            policy_version=self.policy_version,
            pattern_text_basis=self.pattern_text_basis,
            steps=sorted(self._events, key=lambda event: event.seq),
            model_usage=list(self._model_usage),
            signal_reviews=signal_reviews,
            metrics=RunMetrics(
                total_duration_ms=total_duration_ms,
                model_calls=self._model_calls,
                tool_calls=self._tool_calls,
                evidence_items=evidence_items,
                input_tokens=summed(input_values) if usage_complete else None,
                output_tokens=summed(output_values) if usage_complete else None,
                total_tokens=summed(total_values) if usage_complete else None,
            ),
        )
