from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "healthy"}


@router.get("/api/health")
async def api_health_check():
    return {"status": "healthy", "service": "immo-api"}
