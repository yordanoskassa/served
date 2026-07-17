from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from app.db import get_db
from app.routes.auth import _verify_google_token
from app.schemas.analysis import (
    AnalysisResponse,
    SavedAnalysisDetail,
    SavedAnalysisList,
    SavedAnalysisListItem,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

HISTORY_PROJECTION = {
    "filename": 1,
    "verdict": 1,
    "created_at": 1,
    "schema_version": 1,
    "detail_available": 1,
}


def _authenticate(authorization: str):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    return _verify_google_token(token)


@router.get("/summary")
async def summary(authorization: str = Header(default="")) -> dict:
    profile = _authenticate(authorization)
    query = {"google_subject": profile.subject}
    try:
        records = await (
            get_db()
            .analyses.find(query, HISTORY_PROJECTION)
            .sort("created_at", -1)
            .to_list(length=50)
        )
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
         "verdict": record.get("verdict"), "created_at": record.get("created_at"),
         "detail_available": record.get("detail_available") is True or record.get("schema_version") == 2}
        for record in records[:10]
    ]}


def _history_item(record: dict) -> SavedAnalysisListItem:
    return SavedAnalysisListItem(
        id=str(record["_id"]),
        name=record.get("filename") or "Uploaded document",
        verdict=record.get("verdict"),
        created_at=record.get("created_at"),
        detail_available=(
            record.get("detail_available") is True
            or record.get("schema_version") == 2
        ),
    )


@router.get("/analyses", response_model=SavedAnalysisList)
async def analysis_history(
    authorization: str = Header(default=""),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
) -> SavedAnalysisList:
    """List user-owned runs through a bounded, metadata-only page."""
    profile = _authenticate(authorization)
    query = {"google_subject": profile.subject}
    try:
        records = await (
            get_db()
            .analyses.find(query, HISTORY_PROJECTION)
            .sort([("created_at", -1), ("_id", -1)])
            .skip(offset)
            .to_list(length=limit + 1)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Saved analyses are temporarily unavailable.",
        ) from exc

    return SavedAnalysisList(
        items=[_history_item(record) for record in records[:limit]],
        limit=limit,
        offset=offset,
        has_more=len(records) > limit,
    )


@router.get("/analyses/{analysis_id}", response_model=SavedAnalysisDetail)
async def analysis_detail(
    analysis_id: str,
    authorization: str = Header(default=""),
) -> SavedAnalysisDetail:
    """Return a complete saved analysis, scoped to the authenticated owner."""
    profile = _authenticate(authorization)
    if not ObjectId.is_valid(analysis_id):
        raise HTTPException(status_code=404, detail="Saved analysis not found.")

    try:
        record = await get_db().analyses.find_one({
            "_id": ObjectId(analysis_id),
            "google_subject": profile.subject,
        })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Saved analysis is temporarily unavailable.",
        ) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Saved analysis not found.")

    analysis = None
    payload = record.get("analysis")
    if isinstance(payload, dict):
        try:
            analysis = AnalysisResponse.model_validate(payload)
        except ValidationError:
            # Legacy or partially written documents remain listable without
            # inventing analysis details that were never stored.
            analysis = None

    return SavedAnalysisDetail(
        id=str(record["_id"]),
        name=record.get("filename") or "Uploaded document",
        verdict=record.get("verdict"),
        created_at=record.get("created_at"),
        detail_available=analysis is not None,
        analysis=analysis,
    )
