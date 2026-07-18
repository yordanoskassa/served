from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError

from app.db import get_db
from app.routes.auth import _verify_google_token
from app.schemas.analysis import AnalysisResponse
from app.schemas.payroll import PayrollMatchResponse
from app.services.payroll_matcher import (
    MAX_PAYROLL_CSV_BYTES,
    PayrollMatchError,
    extract_payroll_criteria,
    match_payroll_csv,
)


router = APIRouter(prefix="/payroll", tags=["payroll"])
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "payroll"


def _authenticate(authorization: str):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    return _verify_google_token(token)


@router.get("/samples/johns-kitchen.csv", response_class=FileResponse)
async def sample_payroll() -> FileResponse:
    path = FIXTURES / "johns-kitchen-payroll.csv"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Sample payroll export not available.")
    return FileResponse(path, media_type="text/csv", filename=path.name)


@router.post("/analyses/{analysis_id}/match", response_model=PayrollMatchResponse)
async def match_payroll_records(
    analysis_id: str,
    file: UploadFile = File(...),
    authorization: str = Header(default=""),
) -> PayrollMatchResponse:
    profile = _authenticate(authorization)
    if not ObjectId.is_valid(analysis_id):
        raise HTTPException(status_code=404, detail="Saved analysis not found.")
    if file.content_type not in {"text/csv", "application/csv", "application/vnd.ms-excel"}:
        raise HTTPException(status_code=415, detail="Upload a CSV payroll export.")

    try:
        record = await get_db().analyses.find_one({
            "_id": ObjectId(analysis_id),
            "google_subject": profile.subject,
        })
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Saved analysis is temporarily unavailable.") from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Saved analysis not found.")

    try:
        analysis = AnalysisResponse.model_validate(record.get("analysis"))
    except ValidationError as exc:
        raise HTTPException(status_code=409, detail="This saved analysis cannot unlock record matching.") from exc
    if analysis.verdict != "verified":
        raise HTTPException(
            status_code=409,
            detail="Records stay locked until the request is independently verified.",
        )

    data = await file.read(MAX_PAYROLL_CSV_BYTES + 1)
    try:
        criteria = extract_payroll_criteria(analysis)
        return match_payroll_csv(data, criteria)
    except PayrollMatchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
