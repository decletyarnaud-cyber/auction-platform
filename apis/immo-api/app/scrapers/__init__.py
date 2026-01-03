# Scraper modules
"""
Multi-source auction scrapers.

Available scrapers:
- encheres_publiques: encheres-publiques.com (primary)
- licitor: licitor.com (judicial auctions)
- agorastore: agorastore.fr (public sector)

Usage:
    from app.scrapers import run_coordinated_scrape

    result = run_coordinated_scrape(
        db_path="/path/to/db.sqlite",
        departments=["13", "75"],
        max_pages=20,
    )
"""

from .coordinator import ScraperCoordinator, run_coordinated_scrape
from .base_scraper import BaseScraper, AuctionData
from .encheres_publiques_v2 import EncherePubliquesScraperV2, run_scraper as run_encheres_publiques
from .licitor_scraper import LicitorScraper, run_scraper as run_licitor
from .agorastore_scraper import AgorastoreScraper, run_scraper as run_agorastore

__all__ = [
    "ScraperCoordinator",
    "run_coordinated_scrape",
    "BaseScraper",
    "AuctionData",
    "EncherePubliquesScraperV2",
    "LicitorScraper",
    "AgorastoreScraper",
    "run_encheres_publiques",
    "run_licitor",
    "run_agorastore",
]
