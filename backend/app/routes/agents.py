from fastapi import APIRouter

from app.services.agent_system import agent_status

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/status")
async def status() -> dict:
    """Return agent capabilities for the operations dashboard."""
    agents = agent_status()
    return {"agents": agents, "healthy": all(a["enabled"] and not a["last_error"] for a in agents)}
