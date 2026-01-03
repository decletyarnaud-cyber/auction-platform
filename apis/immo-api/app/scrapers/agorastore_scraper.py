"""
Scraper for Agorastore - Public sector auctions

Agorastore hosts auctions from public entities (cities, hospitals, etc.)
API-based scraper for better reliability.
"""

import re
from typing import List, Optional, Dict, Any
from loguru import logger

from .base_scraper import BaseScraper, AuctionData


class AgorastoreScraper(BaseScraper):
    """Scraper for agorastore.fr public auctions."""

    SOURCE_NAME = "agorastore"
    BASE_URL = "https://www.agorastore.fr"
    API_URL = "https://www.agorastore.fr/api"
    RATE_LIMIT_DELAY = 0.5

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        super().__init__(db_path, departments)
        self.departments = departments or []

    def scrape_listing_page(self, page: int) -> List[str]:
        """Scrape listing page using API."""
        # Agorastore uses an API endpoint
        api_url = f"{self.API_URL}/lots"
        params = {
            "category": "immobilier",
            "page": page,
            "limit": 50,
            "sort": "date_fin",
            "order": "asc",
        }

        # Add department filter if specified
        if self.departments:
            params["departements"] = ",".join(self.departments)

        try:
            self._rate_limit()
            response = self.client.get(api_url, params=params)

            if response.status_code == 200:
                data = response.json()
                lots = data.get("lots", data.get("data", data.get("items", [])))

                urls = []
                for lot in lots:
                    lot_id = lot.get("id") or lot.get("lot_id")
                    slug = lot.get("slug", "")
                    if lot_id:
                        url = f"{self.BASE_URL}/lot/{slug}_{lot_id}" if slug else f"{self.BASE_URL}/lot/{lot_id}"
                        urls.append(url)

                return urls

        except Exception as e:
            logger.warning(f"[{self.SOURCE_NAME}] API error: {e}, falling back to HTML")

        # Fallback to HTML scraping
        return self._scrape_listing_html(page)

    def _scrape_listing_html(self, page: int) -> List[str]:
        """Fallback HTML scraping for listing page."""
        url = f"{self.BASE_URL}/immobilier?page={page}"
        soup = self.fetch_page(url)

        if not soup:
            return []

        urls = []
        for link in soup.select("a.lot-card, a[href*='/lot/'], .lot-item a"):
            href = link.get("href", "")
            if "/lot/" in href:
                full_url = self.normalize_url(href)
                if full_url not in urls:
                    urls.append(full_url)

        return urls

    def scrape_detail_page(self, url: str) -> Optional[AuctionData]:
        """Scrape auction detail page."""
        # Try API first
        lot_id = self._extract_lot_id(url)
        if lot_id:
            data = self._fetch_lot_api(lot_id)
            if data:
                return self._parse_api_data(data, url)

        # Fallback to HTML
        return self._scrape_detail_html(url)

    def _extract_lot_id(self, url: str) -> Optional[str]:
        """Extract lot ID from URL."""
        match = re.search(r'_(\d+)$|/lot/(\d+)', url)
        if match:
            return match.group(1) or match.group(2)
        return None

    def _fetch_lot_api(self, lot_id: str) -> Optional[Dict]:
        """Fetch lot data from API."""
        try:
            self._rate_limit()
            response = self.client.get(f"{self.API_URL}/lots/{lot_id}")
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            logger.debug(f"API fetch failed for lot {lot_id}: {e}")
        return None

    def _parse_api_data(self, data: Dict, url: str) -> AuctionData:
        """Parse API response into AuctionData."""
        auction = AuctionData()
        auction.source = self.SOURCE_NAME
        auction.url = url
        auction.source_id = str(data.get("id", ""))

        # Location
        auction.adresse = data.get("adresse") or data.get("address", "")
        auction.code_postal = data.get("code_postal") or data.get("zipcode", "")
        auction.ville = data.get("ville") or data.get("city", "")

        if auction.code_postal:
            auction.department = auction.code_postal[:2]

        # Coordinates
        if data.get("latitude"):
            auction.latitude = float(data["latitude"])
        if data.get("longitude"):
            auction.longitude = float(data["longitude"])

        # Property details
        auction.description = data.get("titre") or data.get("title", "")
        auction.description_detaillee = data.get("description", "")
        auction.type_bien = data.get("type") or data.get("category", "")
        auction.surface = data.get("surface")
        auction.nb_pieces = data.get("nb_pieces") or data.get("rooms")

        # Pricing
        auction.mise_a_prix = data.get("prix_depart") or data.get("starting_price")
        if data.get("prix_actuel") or data.get("current_price"):
            auction.prix_adjudication = data.get("prix_actuel") or data.get("current_price")

        # Dates
        if data.get("date_fin"):
            auction.date_vente = self.parse_french_date(str(data["date_fin"]))
        if data.get("heure_fin"):
            auction.heure_vente = self.parse_time(str(data["heure_fin"]))

        # Visit dates
        visites = data.get("visites", data.get("visit_dates", []))
        if isinstance(visites, list):
            for v in visites:
                if isinstance(v, str):
                    parsed = self.parse_french_date(v)
                    if parsed:
                        auction.dates_visite.append(parsed)
                elif isinstance(v, dict) and v.get("date"):
                    parsed = self.parse_french_date(str(v["date"]))
                    if parsed:
                        auction.dates_visite.append(parsed)

        # Photos
        photos = data.get("photos", data.get("images", []))
        for photo in photos:
            if isinstance(photo, str):
                auction.photos.append(self.normalize_url(photo))
            elif isinstance(photo, dict) and photo.get("url"):
                auction.photos.append(self.normalize_url(photo["url"]))

        # Documents
        docs = data.get("documents", [])
        for doc in docs:
            if isinstance(doc, dict):
                auction.documents.append({
                    "type": doc.get("type", "Document"),
                    "name": doc.get("nom", doc.get("name", "Document")),
                    "url": self.normalize_url(doc.get("url", ""))
                })

        # Seller info
        vendeur = data.get("vendeur", data.get("seller", {}))
        if isinstance(vendeur, dict):
            auction.tribunal = vendeur.get("nom") or vendeur.get("name", "")

        return auction

    def _scrape_detail_html(self, url: str) -> Optional[AuctionData]:
        """Fallback HTML scraping for detail page."""
        soup = self.fetch_page(url)
        if not soup:
            return None

        auction = AuctionData()
        auction.source = self.SOURCE_NAME
        auction.url = url
        auction.source_id = self._extract_lot_id(url)

        text = soup.get_text()

        # Title
        title = soup.select_one("h1, .lot-title, .titre")
        if title:
            auction.description = title.get_text(strip=True)

        # Address
        addr = soup.select_one(".adresse, .address, .location")
        if addr:
            auction.adresse = addr.get_text(strip=True)

        # Postal code and city
        auction.code_postal = self.extract_postal_code(text)
        if auction.code_postal:
            auction.department = auction.code_postal[:2]

        # Property type and surface
        auction.type_bien = self.detect_property_type(text)
        auction.surface = self.extract_surface(text)

        # Price
        price_elem = soup.select_one(".prix, .price, .mise-a-prix")
        if price_elem:
            auction.mise_a_prix = self.extract_price(price_elem.get_text())

        # Description
        desc = soup.select_one(".description, .lot-description")
        if desc:
            auction.description_detaillee = desc.get_text(separator="\n", strip=True)

        # Photos
        for img in soup.select(".gallery img, .photos img, .lot-images img"):
            src = img.get("src") or img.get("data-src")
            if src:
                auction.photos.append(self.normalize_url(src))

        # Visit dates
        visite_section = soup.select_one(".visites, .visit-dates, [class*='visite']")
        if visite_section:
            dates = re.findall(r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", visite_section.get_text())
            for d in dates:
                parsed = self.parse_french_date(d)
                if parsed:
                    auction.dates_visite.append(parsed)

        return auction


def run_scraper(db_path: str, departments: Optional[List[str]] = None, max_pages: int = 20) -> Dict[str, Any]:
    """Run the Agorastore scraper."""
    scraper = AgorastoreScraper(db_path, departments)
    try:
        return scraper.scrape(max_pages)
    finally:
        scraper.close()
