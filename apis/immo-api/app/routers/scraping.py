"""
Scraping API Router

Endpoints for managing and triggering auction scraping.
"""

from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum
import os
from concurrent.futures import ThreadPoolExecutor

from ..scrapers.coordinator import ScraperCoordinator, run_coordinated_scrape

router = APIRouter()

# Database path
DB_PATH = os.environ.get("DB_PATH", "/Users/ade/projects/web/auction-platform/data/auctions_unified.db")

# Executor for background tasks
executor = ThreadPoolExecutor(max_workers=2)


class ScraperSource(str, Enum):
    """Available scraper sources."""
    encheres_publiques = "encheres_publiques"
    licitor = "licitor"
    agorastore = "agorastore"
    all = "all"


class ScrapeRequest(BaseModel):
    """Request model for scraping."""
    sources: Optional[List[ScraperSource]] = None
    departments: Optional[List[str]] = None
    max_pages: int = 20


class ScrapeResponse(BaseModel):
    """Response model for scraping."""
    status: str
    message: str
    job_id: Optional[str] = None


class ScrapeResult(BaseModel):
    """Scraping result model."""
    status: str
    duration_seconds: Optional[float] = None
    sources: Optional[dict] = None
    total_auctions: Optional[int] = None
    after_dedup: Optional[int] = None
    saved: Optional[int] = None
    geocoded: Optional[int] = None


class ScrapeHistoryItem(BaseModel):
    """Scrape history item."""
    id: int
    source: str
    started_at: str
    completed_at: Optional[str] = None
    status: str
    pages_scraped: int = 0
    auctions_found: int = 0
    errors: int = 0
    error_message: Optional[str] = None


@router.post("/trigger", response_model=ScrapeResponse)
async def trigger_scrape(
    background_tasks: BackgroundTasks,
    request: Optional[ScrapeRequest] = None,
):
    """
    Trigger a scraping job.

    Runs scrapers in background and returns immediately.
    Use /scraping/history to check progress.
    """
    departments = request.departments if request else None
    max_pages = request.max_pages if request else 20
    sources = request.sources if request else None

    # Default departments based on environment
    if not departments:
        departments = os.environ.get("DEPARTMENTS", "75,77,78,91,92,93,94,95").split(",")

    # Run in background
    def scrape_task():
        try:
            source_list = None
            if sources and ScraperSource.all not in sources:
                source_list = [s.value for s in sources]

            result = run_coordinated_scrape(
                db_path=DB_PATH,
                departments=departments,
                max_pages=max_pages,
                sources=source_list,
            )
            return result
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # Submit to executor
    executor.submit(scrape_task)

    return ScrapeResponse(
        status="started",
        message=f"Scraping job started for departments: {', '.join(departments)}",
    )


@router.post("/run", response_model=ScrapeResult)
async def run_scrape_sync(
    sources: Optional[List[ScraperSource]] = Query(None),
    departments: Optional[List[str]] = Query(None),
    max_pages: int = Query(10, ge=1, le=50),
):
    """
    Run scraping synchronously and wait for result.

    Use for smaller jobs or testing. For production, use /trigger.
    """
    if not departments:
        departments = os.environ.get("DEPARTMENTS", "75,77,78,91,92,93,94,95").split(",")

    try:
        source_list = None
        if sources and ScraperSource.all not in sources:
            source_list = [s.value for s in sources]

        result = run_coordinated_scrape(
            db_path=DB_PATH,
            departments=departments,
            max_pages=max_pages,
            sources=source_list,
        )

        return ScrapeResult(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=List[ScrapeHistoryItem])
async def get_scrape_history(limit: int = Query(20, ge=1, le=100)):
    """Get recent scraping history."""
    try:
        coordinator = ScraperCoordinator(DB_PATH)
        history = coordinator.get_scrape_history(limit)
        return [ScrapeHistoryItem(**h) for h in history]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources")
async def list_sources():
    """List available scraper sources."""
    return {
        "sources": [
            {
                "id": "encheres_publiques",
                "name": "Enchères Publiques",
                "url": "https://www.encheres-publiques.com",
                "description": "Agrégateur principal d'enchères judiciaires",
            },
            {
                "id": "licitor",
                "name": "Licitor",
                "url": "https://www.licitor.com",
                "description": "Enchères judiciaires des tribunaux",
            },
            {
                "id": "agorastore",
                "name": "Agorastore",
                "url": "https://www.agorastore.fr",
                "description": "Ventes aux enchères du secteur public",
            },
        ]
    }


@router.post("/source/{source}/trigger")
async def trigger_source_scrape(
    source: ScraperSource,
    background_tasks: BackgroundTasks,
    departments: Optional[List[str]] = Query(None),
    max_pages: int = Query(20, ge=1, le=100),
):
    """Trigger scraping for a specific source."""
    if source == ScraperSource.all:
        raise HTTPException(status_code=400, detail="Use /trigger for all sources")

    if not departments:
        departments = os.environ.get("DEPARTMENTS", "75,77,78,91,92,93,94,95").split(",")

    def scrape_task():
        try:
            result = run_coordinated_scrape(
                db_path=DB_PATH,
                departments=departments,
                max_pages=max_pages,
                sources=[source.value],
            )
            return result
        except Exception as e:
            return {"status": "error", "error": str(e)}

    executor.submit(scrape_task)

    return {
        "status": "started",
        "source": source.value,
        "message": f"Scraping {source.value} for departments: {', '.join(departments)}",
    }


@router.get("/stats")
async def get_scraping_stats():
    """Get scraping statistics."""
    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Total auctions
    total = conn.execute("SELECT COUNT(*) FROM auctions").fetchone()[0]

    # By source
    by_source = conn.execute("""
        SELECT source, COUNT(*) as count
        FROM auctions
        GROUP BY source
    """).fetchall()

    # Recent scrapes
    recent = conn.execute("""
        SELECT source, status, started_at, auctions_found
        FROM scrape_history
        ORDER BY started_at DESC
        LIMIT 5
    """).fetchall()

    # Missing data
    missing_coords = conn.execute("""
        SELECT COUNT(*) FROM auctions
        WHERE latitude IS NULL OR longitude IS NULL
    """).fetchone()[0]

    missing_photos = conn.execute("""
        SELECT COUNT(*) FROM auctions
        WHERE photos IS NULL OR photos = '[]'
    """).fetchone()[0]

    missing_visits = conn.execute("""
        SELECT COUNT(*) FROM auctions
        WHERE dates_visite IS NULL OR dates_visite = ''
    """).fetchone()[0]

    conn.close()

    return {
        "total_auctions": total,
        "by_source": {row["source"]: row["count"] for row in by_source},
        "recent_scrapes": [dict(row) for row in recent],
        "data_quality": {
            "missing_coordinates": missing_coords,
            "missing_photos": missing_photos,
            "missing_visit_dates": missing_visits,
        }
    }
