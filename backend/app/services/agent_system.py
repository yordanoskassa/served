"""Small, provider-agnostic multi-agent coordinator.

Agents are intentionally isolated so a failed external provider cannot bring down
the API.  The dashboard can use ``agent_status`` to show health and capabilities.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable


@dataclass
class Agent:
    name: str
    description: str
    runner: Callable[..., Awaitable[Any]] | None = None
    enabled: bool = True
    last_error: str | None = None
    last_run: str | None = None


class AgentCoordinator:
    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}

    def register(self, agent: Agent) -> None:
        self._agents[agent.name] = agent

    def status(self) -> list[dict[str, Any]]:
        return [
            {"name": a.name, "description": a.description, "enabled": a.enabled,
             "last_run": a.last_run, "last_error": a.last_error}
            for a in self._agents.values()
        ]

    async def run(self, name: str, **kwargs: Any) -> Any:
        agent = self._agents.get(name)
        if agent is None:
            return None
        if not agent.enabled or agent.runner is None:
            return None
        try:
            result = await agent.runner(**kwargs)
            agent.last_run = datetime.now(timezone.utc).isoformat()
            agent.last_error = None
            return result
        except Exception as exc:  # fail safe; callers can continue with other evidence
            agent.last_error = str(exc)
            return None


coordinator = AgentCoordinator()
coordinator.register(Agent("document_parser", "Extracts visible facts from uploaded documents."))
coordinator.register(Agent("fraud_patterns", "Matches extracted language against the fraud corpus."))
coordinator.register(Agent("court_records", "Cross-checks case details against CourtListener RECAP."))
coordinator.register(Agent("verdict", "Combines evidence into a cautious verdict and next step."))


def register_runner(name: str, runner: Callable[..., Awaitable[Any]]) -> None:
    """Attach a concrete worker without coupling the coordinator to providers."""
    if name in coordinator._agents:
        coordinator._agents[name].runner = runner


def agent_status() -> list[dict[str, Any]]:
    return coordinator.status()
