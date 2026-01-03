"""
Data retention API endpoints
- Statistics about data lifecycle
- New listings endpoint
- Cleanup triggers
"""
from fastapi import APIRouter, Query
from typing import Optional
from ..services.data_retention import get_retention_manager, run_daily_cleanup

router = APIRouter()


@router.get("/stats")
async def get_retention_stats():
    """Get data retention statistics"""
    manager = get_retention_manager()
    return manager.get_statistics()


@router.get("/new-listings")
async def get_new_listings(days: int = Query(default=7, ge=1, le=30)):
    """
    Get listings first seen in the last N days

    - **days**: Number of days to look back (default: 7, max: 30)
    """
    manager = get_retention_manager()
    listings = manager.get_new_listings(days=days)

    return {
        "count": len(listings),
        "days": days,
        "listings": listings,
    }


@router.get("/expiring-soon")
async def get_expiring_soon(days: int = Query(default=7, ge=1, le=30)):
    """
    Get listings that will expire within N days

    - **days**: Days until expiry to check (default: 7)
    """
    manager = get_retention_manager()
    listings = manager.get_expiring_listings(days_until_expiry=days)

    return {
        "count": len(listings),
        "within_days": days,
        "listings": listings,
    }


@router.post("/cleanup")
async def trigger_cleanup(backup: bool = Query(default=True)):
    """
    Trigger cleanup of expired listings

    - **backup**: Whether to backup before deleting (default: true)
    """
    result = run_daily_cleanup()
    return {
        "status": "completed",
        "deleted": result.get("deleted_count", 0),
        "backup_path": result.get("backup_path", ""),
    }


@router.get("/weekly-summary")
async def get_weekly_summary():
    """Get a summary of new and expiring listings for the current week"""
    manager = get_retention_manager()

    new_listings = manager.get_new_listings(days=7)
    expiring = manager.get_expiring_listings(days_until_expiry=7)
    stats = manager.get_statistics()

    return {
        "week": "current",
        "new_listings": {
            "count": len(new_listings),
            "items": new_listings[:10],  # Top 10
            "has_more": len(new_listings) > 10,
        },
        "expiring_soon": {
            "count": len(expiring),
            "items": expiring[:5],  # Top 5
        },
        "total_active": stats["total"],
        "by_source": stats["by_source"],
    }
