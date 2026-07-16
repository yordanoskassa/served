"""Small, provider-agnostic multi-agent coordinator.

Agents are intentionally isolated so a failed external provider cannot bring down
the API.  The dashboard can use ``agent_status`` to show health and capabilities.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.config import settings


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
            {"name": a.name, "description": a.description,
             "enabled": a.enabled and a.runner is not None,
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
            provider_statuses = {
                getattr(result, "court_lookup_status", None),
                getattr(result, "scam_check_status", None),
            }
            agent.last_error = (
                "One or more configured provider tools were unavailable."
                if "unavailable" in provider_statuses
                else None
            )
            return result
        except Exception as exc:  # fail safe; callers can continue with other evidence
            agent.last_error = str(exc)
            return None


coordinator = AgentCoordinator()
coordinator.register(Agent("reader", "Reads the document and extracts facts without judging them."))
coordinator.register(Agent("checker", "Checks CourtListener and official scam patterns without deciding a verdict."))
coordinator.register(Agent("explainer", "Explains the code-decided result in plain language with exact source quotes."))


def register_runner(name: str, runner: Callable[..., Awaitable[Any]]) -> None:
    """Attach a concrete worker without coupling the coordinator to providers."""
    if name in coordinator._agents:
        coordinator._agents[name].runner = runner


def agent_status() -> list[dict[str, Any]]:
    configured = {
        "reader": bool(settings.openai_api_key),
        "checker": bool(settings.openai_api_key and settings.courtlistener_api_token),
        "explainer": bool(settings.openai_api_key),
    }
    statuses = coordinator.status()
    for item in statuses:
        item["enabled"] = bool(item["enabled"] and configured.get(item["name"], False))
    return statuses
