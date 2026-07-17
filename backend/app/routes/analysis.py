import asyncio
import json
from pathlib import Path

from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, File, Header, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from app.schemas.analysis import AnalysisResponse, TraceEvent
from app.config import settings
from app.db import get_db
from app.routes.auth import _verify_google_token
from app.services.document_analyzer import analyze_document

router = APIRouter(prefix="/documents", tags=["documents"])
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "documents"


def _matches_declared_type(data: bytes, content_type: str) -> bool:
    if content_type == "application/pdf":
        return b"%PDF-" in data[:1024]
    if content_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    return False


async def _authorize_upload(file: UploadFile, authorization: str):
    allowed_types = {"image/jpeg", "image/png", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPEG, PNG, or PDF document.",
        )
    if file.size and file.size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The document must be smaller than 20 MB.",
        )
    data = await file.read(settings.max_upload_bytes + 1)
    await file.seek(0)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The document must be smaller than 20 MB.",
        )
    if not _matches_declared_type(data, file.content_type or ""):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The file contents do not match the declared JPEG, PNG, or PDF type.",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in before analyzing a document.",
        )
    return _verify_google_token(token)


async def _save_analysis(profile, file: UploadFile, result: AnalysisResponse) -> str:
    # Persist the structured result so a user can reopen the exact evidence,
    # extracted facts, deterministic decision, and trace shown after the run.
    # Uploaded file bytes are deliberately never written to MongoDB.
    analysis_id = ObjectId()
    result.saved_analysis_id = str(analysis_id)
    analysis_payload = _saved_analysis_payload(result)
    trace = result.trace
    safe_trace = None
    if trace is not None:
        safe_trace = {
            "run_id": trace.run_id,
            "started_at": trace.started_at,
            "completed_at": trace.completed_at,
            "model_alias": trace.model_alias,
            "prompt_versions": trace.prompt_versions,
            "corpus_version": trace.corpus_version,
            "policy_version": trace.policy_version,
            "verdict_authority": trace.verdict_authority,
            "fact_extraction_basis": trace.fact_extraction_basis,
            "pattern_text_basis": trace.pattern_text_basis,
            "scope": trace.scope,
            "human_review_required": trace.human_review_required,
            "metrics": trace.metrics.model_dump(mode="json"),
            "steps": [
                {
                    "seq": step.seq,
                    "at": step.at,
                    "key": step.key,
                    "kind": step.kind,
                    "status": step.status,
                    "parent_key": step.parent_key,
                    "parallel_group": step.parallel_group,
                    "duration_ms": step.duration_ms,
                    "evidence_count": step.evidence_count,
                }
                for step in trace.steps
            ],
        }
    try:
        await get_db().analyses.insert_one({
            "_id": analysis_id,
            "schema_version": 2,
            "detail_available": True,
            "google_subject": profile.subject,
            "filename": _safe_filename(file.filename),
            "content_type": file.content_type,
            "file_size_bytes": file.size,
            "verdict": result.verdict,
            "document_type": result.document_type,
            "decision": result.decision.model_dump(mode="json") if result.decision else None,
            "run_trace": safe_trace,
            "analysis": analysis_payload,
            "created_at": datetime.now(UTC),
        })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The analysis completed but could not be saved. Please try again.",
        ) from exc
    return str(analysis_id)


def _safe_filename(filename: str | None) -> str:
    """Keep only a bounded display name, never a client-supplied path."""
    name = (filename or "Uploaded document").replace("\\", "/").rsplit("/", 1)[-1]
    return name[:255] or "Uploaded document"


def _saved_analysis_payload(result: AnalysisResponse) -> dict:
    """Create the reopenable result snapshot without provider-internal IDs."""
    payload = result.model_dump(mode="json")
    trace = payload.get("trace")
    if isinstance(trace, dict):
        for usage in trace.get("model_usage") or []:
            if isinstance(usage, dict):
                usage["response_id"] = None
    return payload


@router.get("/samples/{sample_id}", response_class=FileResponse)
async def sample_document(sample_id: str) -> FileResponse:
    sample = sample_id.upper()
    if sample not in {"D1", "D2", "D3"}:
        raise HTTPException(status_code=404, detail="Sample document not found.")
    path = FIXTURES / f"{sample}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Sample document not available.")
    return FileResponse(path, media_type="application/pdf", filename=f"{sample}.pdf")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    file: UploadFile = File(...),
    authorization: str = Header(default=""),
) -> AnalysisResponse:
    profile = await _authorize_upload(file, authorization)
    result = await analyze_document(file)
    await _save_analysis(profile, file, result)
    return result


@router.post("/analyze/stream")
async def analyze_stream(
    file: UploadFile = File(...),
    authorization: str = Header(default=""),
) -> StreamingResponse:
    """Stream observable workflow events, followed by the normal analysis payload."""
    profile = await _authorize_upload(file, authorization)

    async def event_stream():
        queue: asyncio.Queue[dict] = asyncio.Queue()

        async def emit(event: TraceEvent) -> None:
            await queue.put({"type": "trace", "event": event.model_dump(mode="json")})

        async def run_analysis() -> None:
            try:
                result = await analyze_document(file, emit=emit)
                await _save_analysis(profile, file, result)
                await queue.put({
                    "type": "result",
                    "analysis": result.model_dump(mode="json"),
                })
            except HTTPException as exc:
                await queue.put({"type": "error", "detail": str(exc.detail)})
            except Exception:
                await queue.put({
                    "type": "error",
                    "detail": "The analysis could not be completed. Please try again.",
                })

        worker = asyncio.create_task(run_analysis())
        try:
            while True:
                message = await queue.get()
                yield json.dumps(message, separators=(",", ":")) + "\n"
                if message["type"] in {"result", "error"}:
                    break
        finally:
            if not worker.done():
                worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
