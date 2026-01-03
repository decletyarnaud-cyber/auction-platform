"""
Scraper for Licitor.com - Major judicial auction aggregator

Licitor aggregates judicial auctions from multiple sources including:
- Courts (TJ)
- Notaries
- Lawyers
"""

import re
from typing import List, Optional, Dict, Any
from bs4 import BeautifulSoup
from loguru import logger

from .base_scraper import BaseScraper, AuctionData


class LicitorScraper(BaseScraper):
    """Scraper for licitor.com judicial auctions."""

    SOURCE_NAME = "licitor"
    BASE_URL = "https://www.licitor.com"
    RATE_LIMIT_DELAY = 1.0  # More conservative for this site

    # Tribunal mapping for Provence/Marseille region
    TRIBUNAUX_PROVENCE = [
        "tj-marseille",
        "tj-aix-en-provence",
        "tj-toulon",
        "tj-nice",
        "tj-avignon",
        "tj-grasse",
        "tj-draguignan",
    ]

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        super().__init__(db_path, departments)
        self.departments = departments or []

    def scrape_listing_page(self, page: int) -> List[str]:
        """Scrape listing page.

        Licitor organizes by tribunal, so we need to:
        1. Get list of tribunaux from main page
        2. Scrape each tribunal page for Provence region
        """
        urls = []
        seen = set()

        # For page 1, scrape all tribunaux; for other pages, skip (Licitor shows all on one page per tribunal)
        if page > 1:
            return []

        # Get main page to find tribunal links
        main_soup = self.fetch_page(f"{self.BASE_URL}/")
        if not main_soup:
            return []

        # Find all tribunal links for our region
        tribunal_links = []
        for link in main_soup.find_all("a", href=True):
            href = link.get("href", "")
            # Match tribunal pages: /ventes-judiciaires-immobilieres/tj-xxx/date.html
            if "/ventes-judiciaires-immobilieres/tj-" in href:
                for tj in self.TRIBUNAUX_PROVENCE:
                    if tj in href:
                        full_url = self.normalize_url(href)
                        if full_url not in tribunal_links:
                            tribunal_links.append(full_url)
                        break

        logger.info(f"[licitor] Found {len(tribunal_links)} tribunal pages for Provence region")

        # Scrape each tribunal page
        for tribunal_url in tribunal_links:
            soup = self.fetch_page(tribunal_url)
            if not soup:
                continue

            # Find all auction links: /annonce/xx/xx/xx/.../.html
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if "/annonce/" in href and href.endswith(".html"):
                    full_url = self.normalize_url(href)
                    if full_url not in seen:
                        seen.add(full_url)
                        urls.append(full_url)

        logger.info(f"[licitor] Page {page}: {len(urls)} auctions found")
        return urls

    def scrape_detail_page(self, url: str) -> Optional[AuctionData]:
        """Scrape auction detail page."""
        soup = self.fetch_page(url)
        if not soup:
            return None

        auction = AuctionData()
        auction.source = self.SOURCE_NAME
        auction.url = url
        auction.source_id = self._extract_source_id(url)

        text = soup.get_text()

        # Parse all sections
        self._parse_header(soup, auction)
        self._parse_location(soup, text, auction)
        self._parse_property_details(soup, text, auction)
        self._parse_pricing(soup, text, auction)
        self._parse_dates(soup, text, auction)
        self._parse_legal_info(soup, text, auction)
        self._parse_photos(soup, auction)
        self._parse_documents(soup, auction)
        self._parse_visit_dates(soup, text, auction)

        return auction

    def _extract_source_id(self, url: str) -> Optional[str]:
        """Extract source ID from URL."""
        match = re.search(r'/(\d+)(?:\?|$|\.html)', url)
        return match.group(1) if match else None

    def _parse_header(self, soup: BeautifulSoup, auction: AuctionData):
        """Parse header section."""
        # Title
        title = soup.select_one("h1, .titre-annonce, .lot-title")
        if title:
            auction.description = title.get_text(strip=True)

        # Type indicator
        for badge in soup.select(".badge, .tag, .type-vente"):
            badge_text = badge.get_text().lower()
            if "judiciaire" in badge_text:
                # Confirmed judicial auction
                break
            elif "notaire" in badge_text or "volontaire" in badge_text:
                # Skip notarial
                return None

    def _parse_location(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse location information."""
        # Address block
        addr_elem = soup.select_one(".adresse, .localisation, .address, [itemprop='address']")
        if addr_elem:
            auction.adresse = addr_elem.get_text(strip=True)

        # Postal code
        auction.code_postal = self.extract_postal_code(text)
        if auction.code_postal:
            auction.department = auction.code_postal[:2]

        # City
        city_elem = soup.select_one(".ville, .city, [itemprop='addressLocality']")
        if city_elem:
            auction.ville = city_elem.get_text(strip=True)

        # Try to extract from title if not found
        if not auction.ville and auction.description:
            # Pattern: "Appartement à MARSEILLE (13)"
            match = re.search(r'à\s+([A-ZÀ-Ü][A-ZÀ-Ü\s\-]+)(?:\s*\(?\d{2,5}\)?)?', auction.description)
            if match:
                auction.ville = match.group(1).strip().title()

    def _parse_property_details(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse property details."""
        # Property type
        auction.type_bien = self.detect_property_type(text)

        # Surface
        auction.surface = self.extract_surface(text)

        # Rooms
        match = re.search(r"(\d+)\s*(?:pièces?|p\.|chambres?)", text, re.IGNORECASE)
        if match:
            auction.nb_pieces = int(match.group(1))

        # Detailed description
        desc_elem = soup.select_one(".description, .detail, .lot-description, [itemprop='description']")
        if desc_elem:
            auction.description_detaillee = desc_elem.get_text(separator="\n", strip=True)

    def _parse_pricing(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse pricing information."""
        # Look for mise à prix
        patterns = [
            r"mise\s+[àa]\s+prix\s*:?\s*([\d\s,\.]+)\s*€?",
            r"prix\s+de\s+d[ée]part\s*:?\s*([\d\s,\.]+)\s*€?",
            r"([\d\s,\.]+)\s*€\s*(?:mise\s+[àa]\s+prix|MAP)",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                auction.mise_a_prix = self.extract_price(match.group(1))
                if auction.mise_a_prix:
                    break

        # Look for estimated market value
        match = re.search(r"valeur\s+(?:v[ée]nale|march[ée]|estimée?)\s*:?\s*([\d\s,\.]+)\s*€?", text, re.IGNORECASE)
        if match:
            auction.prix_marche_estime = self.extract_price(match.group(1))

    def _parse_dates(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse sale date and time."""
        # Date patterns
        date_patterns = [
            r"(?:vente|adjudication|audience)\s+(?:le\s+)?(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
            r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\s+à\s+\d{1,2}[hH:]",
            r"le\s+(\d{1,2}\s+\w+\s+\d{4})",
        ]

        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                auction.date_vente = self.parse_french_date(match.group(1))
                if auction.date_vente:
                    break

        # Time
        time_match = re.search(r"à\s+(\d{1,2})[hH:](\d{0,2})", text)
        if time_match:
            hour = time_match.group(1)
            minute = time_match.group(2) or "00"
            auction.heure_vente = f"{hour}:{minute.zfill(2)}"

        # Look in specific elements
        date_elem = soup.select_one(".date-vente, .date-adjudication, [itemprop='startDate']")
        if date_elem and not auction.date_vente:
            auction.date_vente = self.parse_french_date(date_elem.get_text())

    def _parse_legal_info(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse legal information."""
        # Tribunal
        tribunal_patterns = [
            r"tribunal\s+judiciaire\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
            r"TJ\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+)",
            r"Tribunal\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+)",
        ]

        for pattern in tribunal_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                auction.tribunal = f"Tribunal Judiciaire de {match.group(1)}"
                break

        # Numéro RG
        rg_match = re.search(r"(?:RG|N°|numéro)\s*:?\s*(\d{2}[/\-]\d+)", text, re.IGNORECASE)
        if rg_match:
            auction.numero_rg = rg_match.group(1)

        # Lawyer info - try multiple approaches
        avocat_section = soup.select_one(".avocat, .lawyer, .contact-avocat, .coordonnees-avocat, [class*='avocat']")

        # Also look for Licitor-specific avocat sections
        if not avocat_section:
            # Licitor uses spans/divs with avocat info near the sidebar
            for elem in soup.select("div, section, aside"):
                elem_text = elem.get_text().lower()
                if "avocat" in elem_text and ("@" in elem_text or "04" in elem_text or "01" in elem_text):
                    avocat_section = elem
                    break

        if avocat_section:
            avocat_text = avocat_section.get_text()

            # Name patterns - look for "Maître", "Me", or "AARPI/SCP" (law firm)
            name_patterns = [
                r"(?:Ma[îi]tre|Me|M[eE]\.)\s+([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
                r"(?:AARPI|SCP|SELARL)\s+([A-Za-zÀ-ü\s\-]+?)(?:,|\s+Avocat)",
            ]
            for pattern in name_patterns:
                name_match = re.search(pattern, avocat_text)
                if name_match:
                    auction.avocat_nom = name_match.group(1).strip()
                    break

            auction.avocat_email = self.extract_email(avocat_text)
            auction.avocat_telephone = self.extract_phone(avocat_text)

        # Fallback: search entire page text for lawyer info
        if not auction.avocat_email:
            auction.avocat_email = self.extract_email(text)

        if not auction.avocat_telephone:
            auction.avocat_telephone = self.extract_phone(text)

        if not auction.avocat_nom:
            # Try to find in full text
            name_match = re.search(r"(?:avocat\s+poursuivant|avocat)\s*:?\s*(?:Ma[îi]tre|Me)?\s*([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)", text, re.IGNORECASE)
            if name_match:
                auction.avocat_nom = name_match.group(1)

    def _parse_photos(self, soup: BeautifulSoup, auction: AuctionData):
        """Parse photos."""
        photos = []
        seen = set()

        # Gallery images
        img_selectors = [
            ".gallery img", ".photos img", ".carousel img", ".slider img",
            ".lot-photos img", "[class*='photo'] img", "[class*='image'] img"
        ]

        for selector in img_selectors:
            for img in soup.select(selector):
                src = img.get("src") or img.get("data-src") or img.get("data-lazy")
                if src:
                    url = self.normalize_url(src)
                    if url not in seen and "placeholder" not in url.lower():
                        seen.add(url)
                        photos.append(url)

        # Background images in divs
        for div in soup.select("[style*='background-image']"):
            style = div.get("style", "")
            match = re.search(r"url\(['\"]?([^'\"]+)['\"]?\)", style)
            if match:
                url = self.normalize_url(match.group(1))
                if url not in seen:
                    seen.add(url)
                    photos.append(url)

        auction.photos = photos[:30]

    def _parse_documents(self, soup: BeautifulSoup, auction: AuctionData):
        """Parse documents."""
        documents = []
        seen = set()

        # PDF links
        for link in soup.select("a[href$='.pdf'], a[href*='document'], a[href*='fichier']"):
            href = link.get("href", "")
            if href:
                url = self.normalize_url(href)
                if url not in seen:
                    seen.add(url)
                    text = link.get_text(strip=True) or "Document"
                    documents.append({
                        "type": text,
                        "name": text,
                        "url": url
                    })

                    # Check for PV
                    if any(x in text.lower() for x in ["procès", "pv", "cahier"]):
                        auction.pv_url = url

        auction.documents = documents

    def _parse_visit_dates(self, soup: BeautifulSoup, text: str, auction: AuctionData):
        """Parse visit dates.

        Licitor format examples:
        - "Visite sur place mardi 2 décembre"
        - "mercredi 10 décembre"
        - "15/01/2026"
        """
        visit_dates = []

        # Look for visit section
        visit_section = soup.select_one(".visites, .dates-visite, [class*='visite'], .visit")
        if visit_section:
            section_text = visit_section.get_text()
            # Date format: dd/mm/yyyy
            dates = re.findall(r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", section_text)
            for d in dates:
                parsed = self.parse_french_date(d)
                if parsed and parsed not in visit_dates:
                    visit_dates.append(parsed)

        # Licitor format: "mardi 2 décembre" or "mercredi 10 décembre"
        # French day names
        jours = r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)"
        # French month names
        mois = r"(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)"

        # Pattern: "visite ... jour DD mois"
        visite_patterns = [
            rf"visite[s]?\s+(?:sur\s+place\s+)?{jours}\s+(\d{{1,2}})\s+({mois})",
            rf"{jours}\s+(\d{{1,2}})\s+({mois})\s*(?:\d{{4}})?",
            r"visite[s]?\s*(?:le|du|:)?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
            r"visite[s]?\s+(?:possible|prévu|organisé)s?\s+(?:le\s+)?(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        ]

        for pattern in visite_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for m in matches:
                if isinstance(m, tuple):
                    # Format: (day, month) like ("2", "décembre")
                    day, month = m
                    # Convert French month to number
                    mois_map = {
                        "janvier": "01", "février": "02", "mars": "03", "avril": "04",
                        "mai": "05", "juin": "06", "juillet": "07", "août": "08",
                        "septembre": "09", "octobre": "10", "novembre": "11", "décembre": "12"
                    }
                    month_num = mois_map.get(month.lower(), "01")
                    # Assume current/next year
                    from datetime import datetime
                    year = datetime.now().year
                    date_str = f"{day.zfill(2)}/{month_num}/{year}"
                    parsed = self.parse_french_date(date_str)
                    # If date is in the past, assume next year
                    if parsed:
                        try:
                            parsed_date = datetime.strptime(parsed, "%Y-%m-%d")
                            if parsed_date < datetime.now():
                                parsed = f"{year + 1}-{month_num}-{day.zfill(2)}"
                        except:
                            pass
                else:
                    parsed = self.parse_french_date(m)

                if parsed and parsed not in visit_dates:
                    visit_dates.append(parsed)

        auction.dates_visite = sorted(visit_dates)


def run_scraper(db_path: str, departments: Optional[List[str]] = None, max_pages: int = 20) -> Dict[str, Any]:
    """Run the Licitor scraper."""
    scraper = LicitorScraper(db_path, departments)
    try:
        return scraper.scrape(max_pages)
    finally:
        scraper.close()
