from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.schemas.analysis import AnalysisResponse
from app.config import settings
from app.services.document_analyzer import analyze_document

router = APIRouter(prefix="/documents", tags=["documents"])
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "documents"


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
async def analyze(file: UploadFile = File(...)) -> AnalysisResponse:
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
    return await analyze_document(file)
