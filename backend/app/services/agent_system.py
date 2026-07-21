"""Small, provider-agnostic multi-agent coordinator.

Agents are intentionally isolated so a failed external provider cannot bring down
the API.  The dashboard can use ``agent_status`` to show health and capabilities.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from app.config import settings
from app.services.plaid import sync_transactions


@dataclass
class Agent:
    name: str
    description: str
    runner: Callable[..., Awaitable[Any]] | None = None
    enabled: bool = True
    last_error: str | None = None
    last_run: str | None = None


class AgentUnavailableError(RuntimeError):
    """A configured runner could not produce an agent result."""


class AgentProviderQuotaError(AgentUnavailableError):
    """A provider rejected the request because its account quota is exhausted."""


def provider_error_code(exc: BaseException) -> str | None:
    """Return a structured provider code without parsing user-facing messages."""
    current: BaseException | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        for value in (getattr(current, "code", None), getattr(current, "type", None)):
            if isinstance(value, str) and value:
                return value
        body = getattr(current, "body", None)
        if isinstance(body, dict):
            for payload in (body, body.get("error")):
                if not isinstance(payload, dict):
                    continue
                for key in ("code", "type"):
                    value = payload.get(key)
                    if isinstance(value, str) and value:
                        return value
        current = current.__cause__ or current.__context__
    return None


def is_provider_quota_error(exc: BaseException) -> bool:
    return provider_error_code(exc) == "insufficient_quota"


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

    async def run(self, name: str, *, raise_on_error: bool = False, **kwargs: Any) -> Any:
        agent = self._agents.get(name)
        if agent is None:
            if raise_on_error:
                raise AgentUnavailableError(f"Agent {name!r} is not registered")
            return None
        if not agent.enabled or agent.runner is None:
            if raise_on_error:
                raise AgentUnavailableError(f"Agent {name!r} is not available")
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
            if is_provider_quota_error(exc):
                agent.last_error = "Provider quota unavailable."
                if raise_on_error:
                    raise AgentProviderQuotaError(
                        f"Agent {name!r} provider quota unavailable"
                    ) from None
                return None
            # Do not expose provider response bodies through the public status API.
            agent.last_error = "Provider request failed."
            if raise_on_error:
                raise AgentUnavailableError(f"Agent {name!r} failed") from exc
            return None


coordinator = AgentCoordinator()
coordinator.register(Agent("reader", "Reads the document and extracts facts without judging them."))
coordinator.register(Agent("checker", "Checks the public federal docket and official scam patterns without deciding a verdict."))
coordinator.register(Agent("explainer", "Explains the code-decided result in plain language with exact source quotes."))
coordinator.register(Agent(
    "cook",
    "Pulls authenticated bank transactions via Plaid for evidence matching.",
    runner=sync_transactions,
))


def register_runner(name: str, runner: Callable[..., Awaitable[Any]]) -> None:
    """Attach a concrete worker without coupling the coordinator to providers."""
    if name in coordinator._agents:
        coordinator._agents[name].runner = runner


def agent_status() -> list[dict[str, Any]]:
    configured = {
        "reader": bool(settings.openai_api_key),
        "checker": bool(settings.openai_api_key and settings.courtlistener_api_token),
        "explainer": bool(settings.openai_api_key),
        "cook": settings.plaid_configured,
    }
    statuses = coordinator.status()
    for item in statuses:
        item["enabled"] = bool(item["enabled"] and configured.get(item["name"], False))
    return statuses
