"""
Scraper Coordinator - Orchestrates multiple scrapers and enrichment

Features:
- Multi-source scraping with parallel execution
- Data deduplication and merging
- Automatic geocoding for addresses
- Cross-source data enrichment
- Scheduled scraping support
"""

import sqlite3
import json
import asyncio
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from concurrent.futures import ThreadPoolExecutor
from loguru import logger

from .base_scraper import AuctionData
from .encheres_publiques_v2 import EncherePubliquesScraperV2
from .licitor_scraper import LicitorScraper
from .agorastore_scraper import AgorastoreScraper
from ..scrapers.geocoder import geocode_address


class ScraperCoordinator:
    """
    Coordinates multiple scrapers and enriches data.

    Responsibilities:
    - Run multiple scrapers in parallel
    - Deduplicate auctions across sources
    - Merge data from multiple sources for same auction
    - Geocode addresses
    - Maintain scrape history
    """

    SCRAPERS = {
        "encheres_publiques": EncherePubliquesScraperV2,
        "licitor": LicitorScraper,
        "agorastore": AgorastoreScraper,
    }

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        self.db_path = db_path
        self.departments = departments or []
        self._ensure_tables()

    def _ensure_tables(self):
        """Ensure required database tables exist."""
        conn = sqlite3.connect(self.db_path)

        # Scrape history table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scrape_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT DEFAULT 'running',
                pages_scraped INTEGER DEFAULT 0,
                auctions_found INTEGER DEFAULT 0,
                auctions_new INTEGER DEFAULT 0,
                auctions_updated INTEGER DEFAULT 0,
                errors INTEGER DEFAULT 0,
                error_message TEXT
            )
        """)

        # Source links table (for multi-source auctions)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auction_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auction_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                source_id TEXT,
                source_url TEXT,
                scraped_at TEXT,
                FOREIGN KEY (auction_id) REFERENCES auctions(id),
                UNIQUE(auction_id, source)
            )
        """)

        # Ensure required columns in auctions table
        cursor = conn.execute("PRAGMA table_info(auctions)")
        existing_cols = {row[1] for row in cursor.fetchall()}

        new_cols = {
            "dates_visite": "TEXT",
            "hash": "TEXT",
            "avocat_nom": "TEXT",
            "avocat_email": "TEXT",
            "avocat_telephone": "TEXT",
            "numero_rg": "TEXT",
            "scraped_at": "TEXT",
            "merged_sources": "TEXT",
        }

        for col, col_type in new_cols.items():
            if col not in existing_cols:
                try:
                    conn.execute(f"ALTER TABLE auctions ADD COLUMN {col} {col_type}")
                except sqlite3.OperationalError:
                    pass

        conn.commit()
        conn.close()

    def run_all(self, max_pages: int = 20, parallel: bool = True) -> Dict[str, Any]:
        """
        Run all scrapers and merge results.

        Args:
            max_pages: Maximum pages to scrape per source
            parallel: Run scrapers in parallel

        Returns:
            Combined results from all scrapers
        """
        logger.info(f"Starting coordinated scrape for departments: {self.departments}")
        start_time = datetime.now()

        results = {}
        all_auctions = []

        if parallel:
            with ThreadPoolExecutor(max_workers=3) as executor:
                futures = {}
                for name, scraper_class in self.SCRAPERS.items():
                    future = executor.submit(
                        self._run_scraper,
                        name,
                        scraper_class,
                        max_pages
                    )
                    futures[name] = future

                for name, future in futures.items():
                    try:
                        result, auctions = future.result()
                        results[name] = result
                        all_auctions.extend(auctions)
                    except Exception as e:
                        logger.error(f"Scraper {name} failed: {e}")
                        results[name] = {"status": "error", "error": str(e)}
        else:
            for name, scraper_class in self.SCRAPERS.items():
                try:
                    result, auctions = self._run_scraper(name, scraper_class, max_pages)
                    results[name] = result
                    all_auctions.extend(auctions)
                except Exception as e:
                    logger.error(f"Scraper {name} failed: {e}")
                    results[name] = {"status": "error", "error": str(e)}

        # Deduplicate and merge
        merged = self._deduplicate_and_merge(all_auctions)

        # Save to database
        saved = self._save_auctions(merged)

        # Geocode missing coordinates
        geocoded = self._geocode_auctions()

        duration = (datetime.now() - start_time).total_seconds()

        return {
            "status": "completed",
            "duration_seconds": round(duration, 2),
            "sources": results,
            "total_auctions": len(all_auctions),
            "after_dedup": len(merged),
            "saved": saved,
            "geocoded": geocoded,
        }

    def run_source(self, source: str, max_pages: int = 20) -> Dict[str, Any]:
        """Run a single scraper source."""
        if source not in self.SCRAPERS:
            raise ValueError(f"Unknown source: {source}. Available: {list(self.SCRAPERS.keys())}")

        scraper_class = self.SCRAPERS[source]
        result, auctions = self._run_scraper(source, scraper_class, max_pages)

        # Save to database
        saved = self._save_auctions(auctions)
        result["saved"] = saved

        return result

    def _run_scraper(
        self,
        name: str,
        scraper_class,
        max_pages: int
    ) -> Tuple[Dict[str, Any], List[AuctionData]]:
        """Run a single scraper and return results."""
        logger.info(f"[{name}] Starting scraper...")

        # Record start
        history_id = self._record_scrape_start(name)

        try:
            scraper = scraper_class(self.db_path, self.departments)
            auctions = []

            # Scrape listing pages
            for page in range(1, max_pages + 1):
                urls = scraper.scrape_listing_page(page)
                if not urls:
                    break

                logger.info(f"[{name}] Page {page}: {len(urls)} auctions")

                for url in urls:
                    try:
                        auction = scraper.scrape_detail_page(url)
                        if auction:
                            auction.compute_hash()
                            auctions.append(auction)
                    except Exception as e:
                        logger.debug(f"[{name}] Error scraping {url}: {e}")

            scraper.close()

            result = {
                "status": "completed",
                "pages_scraped": page,
                "auctions_found": len(auctions),
            }

            self._record_scrape_complete(history_id, result)
            return result, auctions

        except Exception as e:
            logger.error(f"[{name}] Scraper error: {e}")
            self._record_scrape_error(history_id, str(e))
            raise

    def _deduplicate_and_merge(self, auctions: List[AuctionData]) -> List[AuctionData]:
        """
        Deduplicate auctions and merge data from multiple sources.

        Uses multiple strategies:
        1. Same source_id from same source
        2. Same URL
        3. Similar address + price + date
        """
        if not auctions:
            return []

        # Group by dedup keys
        groups: Dict[str, List[AuctionData]] = {}

        for auction in auctions:
            # Primary key: hash
            key = auction.hash

            # Fallback keys
            if not key:
                if auction.url:
                    key = f"url:{auction.url}"
                elif auction.adresse and auction.code_postal:
                    key = f"addr:{auction.adresse}:{auction.code_postal}"
                else:
                    key = f"desc:{auction.description or ''}:{auction.mise_a_prix or ''}"

            if key not in groups:
                groups[key] = []
            groups[key].append(auction)

        # Merge groups
        merged = []
        for key, group in groups.items():
            if len(group) == 1:
                merged.append(group[0])
            else:
                # Merge multiple sources
                merged_auction = self._merge_auctions(group)
                merged.append(merged_auction)

        logger.info(f"Deduplicated {len(auctions)} -> {len(merged)} auctions")
        return merged

    def _merge_auctions(self, auctions: List[AuctionData]) -> AuctionData:
        """Merge multiple auction records into one, keeping best data."""
        if len(auctions) == 1:
            return auctions[0]

        # Start with first auction as base
        merged = auctions[0]
        sources = [merged.source]

        for auction in auctions[1:]:
            sources.append(auction.source)

            # Merge fields - prefer non-empty values
            if not merged.adresse and auction.adresse:
                merged.adresse = auction.adresse
            if not merged.code_postal and auction.code_postal:
                merged.code_postal = auction.code_postal
            if not merged.ville and auction.ville:
                merged.ville = auction.ville
            if not merged.department and auction.department:
                merged.department = auction.department
            if not merged.latitude and auction.latitude:
                merged.latitude = auction.latitude
            if not merged.longitude and auction.longitude:
                merged.longitude = auction.longitude

            # Property details
            if not merged.surface and auction.surface:
                merged.surface = auction.surface
            if not merged.nb_pieces and auction.nb_pieces:
                merged.nb_pieces = auction.nb_pieces
            if not merged.type_bien and auction.type_bien:
                merged.type_bien = auction.type_bien

            # Prefer longer description
            if auction.description_detaillee:
                if not merged.description_detaillee or len(auction.description_detaillee) > len(merged.description_detaillee):
                    merged.description_detaillee = auction.description_detaillee

            # Pricing
            if not merged.mise_a_prix and auction.mise_a_prix:
                merged.mise_a_prix = auction.mise_a_prix
            if not merged.prix_marche_estime and auction.prix_marche_estime:
                merged.prix_marche_estime = auction.prix_marche_estime

            # Legal
            if not merged.tribunal and auction.tribunal:
                merged.tribunal = auction.tribunal
            if not merged.avocat_nom and auction.avocat_nom:
                merged.avocat_nom = auction.avocat_nom
            if not merged.avocat_email and auction.avocat_email:
                merged.avocat_email = auction.avocat_email
            if not merged.avocat_telephone and auction.avocat_telephone:
                merged.avocat_telephone = auction.avocat_telephone
            if not merged.numero_rg and auction.numero_rg:
                merged.numero_rg = auction.numero_rg

            # Dates
            if not merged.date_vente and auction.date_vente:
                merged.date_vente = auction.date_vente
            if not merged.heure_vente and auction.heure_vente:
                merged.heure_vente = auction.heure_vente

            # Merge visit dates
            for vd in auction.dates_visite:
                if vd not in merged.dates_visite:
                    merged.dates_visite.append(vd)

            # Merge photos
            for photo in auction.photos:
                if photo not in merged.photos:
                    merged.photos.append(photo)

            # Merge documents
            existing_urls = {d["url"] for d in merged.documents}
            for doc in auction.documents:
                if doc["url"] not in existing_urls:
                    merged.documents.append(doc)
                    existing_urls.add(doc["url"])

            # PV URL
            if not merged.pv_url and auction.pv_url:
                merged.pv_url = auction.pv_url

        # Record merged sources
        merged.source = sources[0]  # Primary source
        # Store additional sources as JSON in a field
        merged.scraped_at = datetime.now().isoformat()

        # Limit photos
        merged.photos = merged.photos[:30]

        # Sort visit dates
        merged.dates_visite = sorted(set(merged.dates_visite))

        logger.debug(f"Merged {len(auctions)} sources: {sources}")
        return merged

    def _save_auctions(self, auctions: List[AuctionData]) -> int:
        """Save auctions to database."""
        if not auctions:
            return 0

        conn = sqlite3.connect(self.db_path)
        saved = 0

        for auction in auctions:
            try:
                # Check if exists
                existing = conn.execute(
                    "SELECT id FROM auctions WHERE hash = ? OR url = ?",
                    (auction.hash, auction.url)
                ).fetchone()

                data = auction.to_dict()

                if existing:
                    # Update
                    self._update_record(conn, existing[0], data)
                else:
                    # Insert
                    self._insert_record(conn, data)

                saved += 1

            except Exception as e:
                logger.error(f"Error saving auction: {e}")

        conn.commit()
        conn.close()

        logger.info(f"Saved {saved} auctions to database")
        return saved

    def _update_record(self, conn: sqlite3.Connection, auction_id: int, data: Dict):
        """Update existing auction record."""
        update_fields = []
        params = []

        # Fields to update
        for field in ["photos", "documents", "description_detaillee", "pv_url",
                      "dates_visite", "avocat_nom", "avocat_email", "avocat_telephone",
                      "latitude", "longitude", "scraped_at"]:
            if data.get(field):
                update_fields.append(f"{field} = ?")
                params.append(data[field])

        if update_fields:
            params.append(auction_id)
            query = f"UPDATE auctions SET {', '.join(update_fields)} WHERE id = ?"
            conn.execute(query, params)

    def _insert_record(self, conn: sqlite3.Connection, data: Dict):
        """Insert new auction record."""
        columns = [
            "source", "source_id", "url", "adresse", "code_postal", "ville", "department",
            "latitude", "longitude", "type_bien", "surface", "nb_pieces",
            "description", "description_detaillee", "mise_a_prix", "date_vente", "heure_vente",
            "tribunal", "avocat_nom", "avocat_email", "avocat_telephone", "numero_rg",
            "dates_visite", "photos", "documents", "pv_url", "hash", "scraped_at",
        ]

        values = [data.get(col) for col in columns]
        placeholders = ", ".join(["?" for _ in columns])
        columns_str = ", ".join(columns)

        query = f"INSERT INTO auctions ({columns_str}) VALUES ({placeholders})"
        conn.execute(query, values)

    def _geocode_auctions(self, batch_size: int = 50) -> int:
        """Geocode auctions missing coordinates."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        # Find auctions without coordinates
        rows = conn.execute("""
            SELECT id, adresse, code_postal, ville
            FROM auctions
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND adresse IS NOT NULL
            LIMIT ?
        """, [batch_size]).fetchall()

        geocoded = 0

        for row in rows:
            try:
                address = f"{row['adresse']}, {row['code_postal']} {row['ville'] or ''}"
                result = geocode_address(address)

                if result and result.get("lat") and result.get("lon"):
                    conn.execute(
                        "UPDATE auctions SET latitude = ?, longitude = ? WHERE id = ?",
                        [result["lat"], result["lon"], row["id"]]
                    )
                    geocoded += 1

            except Exception as e:
                logger.debug(f"Geocoding error for {row['id']}: {e}")

        conn.commit()
        conn.close()

        if geocoded > 0:
            logger.info(f"Geocoded {geocoded} auctions")

        return geocoded

    def _record_scrape_start(self, source: str) -> int:
        """Record scrape start in history."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.execute(
            "INSERT INTO scrape_history (source, started_at) VALUES (?, ?)",
            [source, datetime.now().isoformat()]
        )
        history_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return history_id

    def _record_scrape_complete(self, history_id: int, result: Dict):
        """Record scrape completion."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            UPDATE scrape_history SET
                completed_at = ?,
                status = 'completed',
                pages_scraped = ?,
                auctions_found = ?
            WHERE id = ?
        """, [
            datetime.now().isoformat(),
            result.get("pages_scraped", 0),
            result.get("auctions_found", 0),
            history_id
        ])
        conn.commit()
        conn.close()

    def _record_scrape_error(self, history_id: int, error: str):
        """Record scrape error."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            UPDATE scrape_history SET
                completed_at = ?,
                status = 'error',
                error_message = ?
            WHERE id = ?
        """, [datetime.now().isoformat(), error, history_id])
        conn.commit()
        conn.close()

    def get_scrape_history(self, limit: int = 20) -> List[Dict]:
        """Get recent scrape history."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        rows = conn.execute("""
            SELECT * FROM scrape_history
            ORDER BY started_at DESC
            LIMIT ?
        """, [limit]).fetchall()

        conn.close()
        return [dict(row) for row in rows]


def run_coordinated_scrape(
    db_path: str,
    departments: Optional[List[str]] = None,
    max_pages: int = 20,
    sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run coordinated multi-source scrape.

    Args:
        db_path: Path to SQLite database
        departments: List of department codes to filter
        max_pages: Max pages per source
        sources: Specific sources to run (default: all)

    Returns:
        Combined scrape results
    """
    coordinator = ScraperCoordinator(db_path, departments)

    if sources:
        results = {}
        for source in sources:
            if source in coordinator.SCRAPERS:
                results[source] = coordinator.run_source(source, max_pages)
        return results
    else:
        return coordinator.run_all(max_pages)
