"""
Base Scraper Class - Abstract foundation for all auction scrapers

Provides common functionality:
- HTTP client with retry logic
- Rate limiting
- Parsing utilities
- Database operations
"""

import re
import json
import time
import sqlite3
import hashlib
from abc import ABC, abstractmethod
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any, Tuple
from urllib.parse import urljoin, urlparse, unquote
import httpx
from bs4 import BeautifulSoup
from loguru import logger


class AuctionData:
    """Standardized auction data structure."""

    def __init__(self):
        # Source info
        self.source: str = ""
        self.source_id: Optional[str] = None
        self.url: Optional[str] = None

        # Location
        self.adresse: Optional[str] = None
        self.code_postal: Optional[str] = None
        self.ville: Optional[str] = None
        self.department: Optional[str] = None
        self.latitude: Optional[float] = None
        self.longitude: Optional[float] = None

        # Property details
        self.type_bien: Optional[str] = None
        self.surface: Optional[float] = None
        self.nb_pieces: Optional[int] = None
        self.description: Optional[str] = None
        self.description_detaillee: Optional[str] = None

        # Pricing
        self.mise_a_prix: Optional[float] = None
        self.prix_adjudication: Optional[float] = None
        self.prix_marche_estime: Optional[float] = None
        self.prix_m2_marche: Optional[float] = None

        # Legal info
        self.tribunal: Optional[str] = None
        self.avocat_nom: Optional[str] = None
        self.avocat_email: Optional[str] = None
        self.avocat_telephone: Optional[str] = None
        self.numero_rg: Optional[str] = None

        # Dates
        self.date_vente: Optional[str] = None
        self.heure_vente: Optional[str] = None
        self.dates_visite: List[str] = []

        # Media
        self.photos: List[str] = []
        self.documents: List[Dict[str, str]] = []
        self.pv_url: Optional[str] = None

        # Metadata
        self.scraped_at: str = datetime.now().isoformat()
        self.hash: Optional[str] = None

    def compute_hash(self) -> str:
        """Compute unique hash for deduplication."""
        content = f"{self.source}:{self.adresse}:{self.code_postal}:{self.mise_a_prix}:{self.date_vente}"
        self.hash = hashlib.md5(content.encode()).hexdigest()
        return self.hash

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "source": self.source,
            "source_id": self.source_id,
            "url": self.url,
            "adresse": self.adresse,
            "code_postal": self.code_postal,
            "ville": self.ville,
            "department": self.department,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "type_bien": self.type_bien,
            "surface": self.surface,
            "nb_pieces": self.nb_pieces,
            "description": self.description,
            "description_detaillee": self.description_detaillee,
            "mise_a_prix": self.mise_a_prix,
            "prix_adjudication": self.prix_adjudication,
            "prix_marche_estime": self.prix_marche_estime,
            "prix_m2_marche": self.prix_m2_marche,
            "tribunal": self.tribunal,
            "avocat_nom": self.avocat_nom,
            "avocat_email": self.avocat_email,
            "avocat_telephone": self.avocat_telephone,
            "numero_rg": self.numero_rg,
            "date_vente": self.date_vente,
            "heure_vente": self.heure_vente,
            "dates_visite": ",".join(self.dates_visite) if self.dates_visite else None,
            "photos": json.dumps(self.photos) if self.photos else None,
            "documents": json.dumps(self.documents) if self.documents else None,
            "pv_url": self.pv_url,
            "scraped_at": self.scraped_at,
            "hash": self.hash,
        }


class BaseScraper(ABC):
    """Abstract base class for all auction scrapers."""

    # Override in subclasses
    SOURCE_NAME = "base"
    BASE_URL = ""
    RATE_LIMIT_DELAY = 0.5  # seconds between requests

    # Common patterns
    PRICE_PATTERN = re.compile(r"([\d\s]+(?:[,\.]\d+)?)\s*(?:€|euros?|EUR)?", re.IGNORECASE)
    SURFACE_PATTERN = re.compile(r"(\d+(?:[.,]\d+)?)\s*m[²2]", re.IGNORECASE)
    POSTAL_CODE_PATTERN = re.compile(r"\b(\d{5})\b")
    DATE_FR_PATTERN = re.compile(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})")
    EMAIL_PATTERN = re.compile(r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})")
    PHONE_PATTERN = re.compile(r"(?:(?:\+33|0)\s*[1-9])(?:[\s.\-]?\d{2}){4}")

    # Month name to number mapping (French)
    MONTH_MAP = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "jan": 1, "fév": 2, "mar": 3, "avr": 4,
        "jui": 6, "jul": 7, "aoû": 8, "sep": 9, "oct": 10, "nov": 11, "déc": 12,
    }

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        self.db_path = db_path
        self.departments = departments or []
        self.client = httpx.Client(
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            },
            follow_redirects=True,
        )
        self._last_request_time = 0

    def close(self):
        """Close HTTP client."""
        self.client.close()

    def _rate_limit(self):
        """Apply rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    def fetch_page(self, url: str, retries: int = 3) -> Optional[BeautifulSoup]:
        """Fetch and parse a page with retry logic."""
        self._rate_limit()

        for attempt in range(retries):
            try:
                response = self.client.get(url)
                response.raise_for_status()
                return BeautifulSoup(response.text, "html.parser")
            except httpx.HTTPStatusError as e:
                logger.warning(f"HTTP {e.response.status_code} for {url} (attempt {attempt + 1})")
                if e.response.status_code == 404:
                    return None
                time.sleep(2 ** attempt)
            except httpx.RequestError as e:
                logger.warning(f"Request error for {url}: {e} (attempt {attempt + 1})")
                time.sleep(2 ** attempt)
            except Exception as e:
                logger.error(f"Unexpected error fetching {url}: {e}")
                return None

        return None

    def fetch_json(self, url: str, retries: int = 3) -> Optional[Dict]:
        """Fetch JSON endpoint."""
        self._rate_limit()

        for attempt in range(retries):
            try:
                response = self.client.get(url)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.warning(f"JSON fetch error for {url}: {e} (attempt {attempt + 1})")
                time.sleep(2 ** attempt)

        return None

    # =============== Parsing Utilities ===============

    def extract_price(self, text: str) -> Optional[float]:
        """Extract price from text, handling French number formatting."""
        if not text:
            return None

        # Remove common text
        text = re.sub(r"(mise\s+[àa]\s+prix|prix|€|euros?|EUR)", "", text, flags=re.IGNORECASE)

        # Find number pattern
        match = re.search(r"([\d\s,\.]+)", text)
        if not match:
            return None

        num_str = match.group(1).strip()
        # Remove spaces (thousand separators in French)
        num_str = num_str.replace(" ", "").replace("\u00a0", "")

        # Handle French decimal (comma) vs dot
        if "," in num_str and "." in num_str:
            # Both present: likely 1.234,56 format
            num_str = num_str.replace(".", "").replace(",", ".")
        elif "," in num_str:
            # Only comma: could be decimal or thousand separator
            parts = num_str.split(",")
            if len(parts[-1]) == 2:
                # Likely decimal: 1234,56
                num_str = num_str.replace(",", ".")
            else:
                # Likely thousand separator: 1,234,567
                num_str = num_str.replace(",", "")
        elif "." in num_str:
            # Only dots: check if thousand separator
            parts = num_str.split(".")
            if len(parts) > 2 or (len(parts) == 2 and len(parts[-1]) == 3):
                # Thousand separators
                num_str = num_str.replace(".", "")

        try:
            return float(num_str)
        except ValueError:
            return None

    def extract_surface(self, text: str) -> Optional[float]:
        """Extract surface area in m²."""
        match = self.SURFACE_PATTERN.search(text)
        if match:
            return float(match.group(1).replace(",", "."))
        return None

    def extract_postal_code(self, text: str) -> Optional[str]:
        """Extract French postal code."""
        match = self.POSTAL_CODE_PATTERN.search(text)
        return match.group(1) if match else None

    def parse_french_date(self, text: str) -> Optional[str]:
        """Parse various French date formats to YYYY-MM-DD."""
        if not text:
            return None

        text = text.lower().strip()

        # Try numeric formats: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
        match = self.DATE_FR_PATTERN.search(text)
        if match:
            day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
            if year < 100:
                year += 2000
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                pass

        # Try text format: "15 janvier 2025", "mer. 15 janvier 2025"
        for month_name, month_num in self.MONTH_MAP.items():
            if month_name in text:
                day_match = re.search(rf"(\d{{1,2}})\s*{month_name}", text)
                year_match = re.search(r"(\d{4})", text)
                if day_match and year_match:
                    try:
                        return date(int(year_match.group(1)), month_num, int(day_match.group(1))).isoformat()
                    except ValueError:
                        pass

        return None

    def parse_time(self, text: str) -> Optional[str]:
        """Parse time from text."""
        if not text:
            return None

        # Match: 14h30, 14:30, 14h, 14 h 30
        match = re.search(r"(\d{1,2})\s*[hH:]\s*(\d{0,2})", text)
        if match:
            hour = match.group(1)
            minute = match.group(2) if match.group(2) else "00"
            return f"{hour}:{minute.zfill(2)}"
        return None

    def extract_email(self, text: str) -> Optional[str]:
        """Extract email address."""
        match = self.EMAIL_PATTERN.search(text)
        return match.group(1) if match else None

    def extract_phone(self, text: str) -> Optional[str]:
        """Extract French phone number."""
        match = self.PHONE_PATTERN.search(text)
        if match:
            phone = match.group(0)
            # Normalize format
            phone = re.sub(r"[\s.\-]", "", phone)
            if phone.startswith("+33"):
                phone = "0" + phone[3:]
            return phone
        return None

    def detect_property_type(self, text: str) -> Optional[str]:
        """Detect property type from text."""
        text = text.lower()

        type_keywords = {
            "appartement": ["appartement", "studio", "duplex", "loft", "f1", "f2", "f3", "f4", "f5", "t1", "t2", "t3", "t4", "t5"],
            "maison": ["maison", "villa", "pavillon", "propriété", "demeure", "corps de ferme"],
            "local commercial": ["local commercial", "boutique", "commerce", "bureau", "bureaux", "local professionnel"],
            "terrain": ["terrain", "parcelle", "foncier", "terrain constructible"],
            "parking": ["parking", "garage", "box", "stationnement", "place de parking"],
            "immeuble": ["immeuble", "building", "ensemble immobilier"],
            "cave": ["cave", "cellier"],
        }

        for prop_type, keywords in type_keywords.items():
            if any(kw in text for kw in keywords):
                return prop_type

        return None

    def normalize_url(self, url: str, base: Optional[str] = None) -> str:
        """Normalize and complete URL."""
        if not url:
            return ""

        base = base or self.BASE_URL

        if url.startswith("//"):
            return "https:" + url
        elif url.startswith("/"):
            return urljoin(base, url)
        elif not url.startswith("http"):
            return urljoin(base, url)

        return url

    # =============== Abstract Methods ===============

    @abstractmethod
    def scrape_listing_page(self, page: int) -> List[str]:
        """Scrape a listing page and return auction URLs."""
        pass

    @abstractmethod
    def scrape_detail_page(self, url: str) -> Optional[AuctionData]:
        """Scrape an auction detail page."""
        pass

    # =============== Main Scrape Method ===============

    def scrape(self, max_pages: int = 20) -> Dict[str, Any]:
        """Main scraping entry point."""
        logger.info(f"[{self.SOURCE_NAME}] Starting scrape for departments: {self.departments}")

        all_urls = []
        scraped_count = 0
        error_count = 0
        results = []

        # Scrape listing pages
        for page in range(1, max_pages + 1):
            try:
                urls = self.scrape_listing_page(page)
                if not urls:
                    logger.info(f"[{self.SOURCE_NAME}] No more results at page {page}")
                    break

                logger.info(f"[{self.SOURCE_NAME}] Page {page}: found {len(urls)} auctions")

                for url in urls:
                    if url in all_urls:
                        continue

                    all_urls.append(url)

                    try:
                        data = self.scrape_detail_page(url)
                        if data:
                            data.compute_hash()
                            results.append(data)
                            scraped_count += 1
                    except Exception as e:
                        logger.error(f"[{self.SOURCE_NAME}] Error scraping {url}: {e}")
                        error_count += 1

            except Exception as e:
                logger.error(f"[{self.SOURCE_NAME}] Error on page {page}: {e}")
                error_count += 1

        # Save to database
        saved = self._save_to_database(results)

        result = {
            "source": self.SOURCE_NAME,
            "status": "completed",
            "pages_scraped": max_pages,
            "urls_found": len(all_urls),
            "scraped": scraped_count,
            "saved": saved,
            "errors": error_count,
        }

        logger.info(f"[{self.SOURCE_NAME}] Scrape completed: {result}")
        return result

    def _save_to_database(self, auctions: List[AuctionData]) -> int:
        """Save or update auctions in database."""
        if not auctions:
            return 0

        conn = sqlite3.connect(self.db_path)
        saved = 0

        try:
            # Ensure all columns exist
            self._ensure_columns(conn)

            for auction in auctions:
                try:
                    # Check if exists by hash or URL
                    existing = conn.execute(
                        "SELECT id FROM auctions WHERE hash = ? OR url = ?",
                        (auction.hash, auction.url)
                    ).fetchone()

                    data = auction.to_dict()

                    if existing:
                        # Update existing
                        self._update_auction(conn, existing[0], data)
                    else:
                        # Insert new
                        self._insert_auction(conn, data)

                    saved += 1

                except Exception as e:
                    logger.error(f"[{self.SOURCE_NAME}] Error saving auction: {e}")

            conn.commit()

        finally:
            conn.close()

        return saved

    def _ensure_columns(self, conn: sqlite3.Connection):
        """Ensure all required columns exist in auctions table."""
        # Get existing columns
        cursor = conn.execute("PRAGMA table_info(auctions)")
        existing = {row[1] for row in cursor.fetchall()}

        # Required columns with types
        required = {
            "hash": "TEXT",
            "scraped_at": "TEXT",
            "avocat_nom": "TEXT",
            "avocat_email": "TEXT",
            "avocat_telephone": "TEXT",
            "numero_rg": "TEXT",
            "dates_visite": "TEXT",
        }

        for col, col_type in required.items():
            if col not in existing:
                try:
                    conn.execute(f"ALTER TABLE auctions ADD COLUMN {col} {col_type}")
                    logger.info(f"Added column {col} to auctions table")
                except sqlite3.OperationalError:
                    pass

    def _update_auction(self, conn: sqlite3.Connection, auction_id: int, data: Dict):
        """Update existing auction with new data."""
        # Only update fields that have values
        updates = []
        params = []

        update_fields = [
            "photos", "documents", "description_detaillee", "pv_url",
            "dates_visite", "avocat_nom", "avocat_email", "avocat_telephone",
            "latitude", "longitude", "scraped_at",
        ]

        for field in update_fields:
            if data.get(field):
                updates.append(f"{field} = ?")
                params.append(data[field])

        if updates:
            params.append(auction_id)
            query = f"UPDATE auctions SET {', '.join(updates)} WHERE id = ?"
            conn.execute(query, params)

    def _insert_auction(self, conn: sqlite3.Connection, data: Dict):
        """Insert new auction."""
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
