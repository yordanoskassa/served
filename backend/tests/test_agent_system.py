import asyncio

import pytest

from app.services.agent_system import (
    Agent,
    AgentCoordinator,
    AgentProviderQuotaError,
    AgentUnavailableError,
)


class FakeProviderError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.body = {
            "error": {
                "code": code,
                "type": code,
                "message": message,
            }
        }


def test_coordinator_classifies_insufficient_quota_and_sanitizes_status() -> None:
    async def fail() -> None:
        raise FakeProviderError(
            "insufficient_quota",
            "You exceeded your quota. Billing account secret detail.",
        )

    coordinator = AgentCoordinator()
    agent = Agent("reader", "Reads facts", runner=fail)
    coordinator.register(agent)

    with pytest.raises(AgentProviderQuotaError):
        asyncio.run(coordinator.run("reader", raise_on_error=True))

    assert agent.last_error == "Provider quota unavailable."
    assert "billing" not in agent.last_error.lower()
    assert "secret" not in agent.last_error.lower()


def test_regular_rate_limit_is_not_classified_as_exhausted_quota() -> None:
    async def fail() -> None:
        raise FakeProviderError("rate_limit_exceeded", "Too many requests")

    coordinator = AgentCoordinator()
    agent = Agent("reader", "Reads facts", runner=fail)
    coordinator.register(agent)

    with pytest.raises(AgentUnavailableError) as caught:
        asyncio.run(coordinator.run("reader", raise_on_error=True))

    assert not isinstance(caught.value, AgentProviderQuotaError)
    assert agent.last_error == "Provider request failed."
