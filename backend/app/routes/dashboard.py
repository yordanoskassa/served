from fastapi import APIRouter, Header, HTTPException

from app.db import get_db
from app.routes.auth import _verify_google_token

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(authorization: str = Header(default="")) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    profile = _verify_google_token(token)
    query = {"google_subject": profile.subject}
    try:
        records = await get_db().analyses.find(query).sort("created_at", -1).to_list(length=50)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Dashboard data is temporarily unavailable.") from exc
    counts = {"documents": len(records), "verified": 0, "review": 0, "scam": 0}
    for record in records:
        verdict = record.get("verdict")
        if verdict == "verified": counts["verified"] += 1
        elif verdict in {"scam", "scam_indicators"}: counts["scam"] += 1
        else: counts["review"] += 1
    return {"counts": counts, "recent": [
        {"id": str(record.get("_id")), "name": record.get("filename") or "Uploaded document",
         "verdict": record.get("verdict"), "created_at": record.get("created_at")}
        for record in records[:10]
    ]}
