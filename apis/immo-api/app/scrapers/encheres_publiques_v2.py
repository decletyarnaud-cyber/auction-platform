"""
Enhanced Scraper for encheres-publiques.com

Improvements over v1:
- Proper photo extraction from Apollo/Next.js data
- Visit dates extraction
- Lawyer contact information
- Better structured data parsing
- GraphQL cache parsing
"""

import re
import json
from typing import List, Optional, Dict, Any
from urllib.parse import unquote
from bs4 import BeautifulSoup
from loguru import logger

from .base_scraper import BaseScraper, AuctionData


class EncherePubliquesScraperV2(BaseScraper):
    """Enhanced scraper for encheres-publiques.com"""

    SOURCE_NAME = "encheres_publiques"
    BASE_URL = "https://www.encheres-publiques.com"
    RATE_LIMIT_DELAY = 0.5

    # Property types in URL
    PROPERTY_TYPES = [
        "appartements", "maisons", "immeubles", "terrains",
        "parkings", "locaux-commerciaux", "biens-exception"
    ]

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        super().__init__(db_path, departments)
        self.departments = departments or ["75", "77", "78", "91", "92", "93", "94", "95"]

    def scrape_listing_page(self, page: int) -> List[str]:
        """Scrape listing page and return auction URLs."""
        url = f"{self.BASE_URL}/encheres/immobilier?page={page}"
        soup = self.fetch_page(url)

        if not soup:
            return []

        urls = []
        seen = set()

        # Method 1: Extract from anchor tags (most reliable)
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            # Match auction URLs: /encheres/immobilier/xxx/xxx_ID
            if "/encheres/immobilier/" in href and re.search(r'_\d+$', href):
                full_url = self.normalize_url(href)
                if full_url not in seen:
                    if not self.departments or self._is_target_department(full_url):
                        seen.add(full_url)
                        urls.append(full_url)

        # Method 2: Extract from __NEXT_DATA__ script
        next_data_script = soup.find("script", id="__NEXT_DATA__")
        if next_data_script and next_data_script.string:
            try:
                data = json.loads(next_data_script.string)
                page_props = data.get("props", {}).get("pageProps", {})

                # Check apolloState for lot entries
                apollo_state = page_props.get("apolloState", page_props.get("__APOLLO_STATE__", {}))
                for key, value in apollo_state.items():
                    if key.startswith("Lot:") and isinstance(value, dict):
                        lot_url = value.get("url", "")
                        if lot_url:
                            full_url = self.normalize_url(lot_url)
                            if full_url not in seen:
                                if not self.departments or self._is_target_department(full_url):
                                    seen.add(full_url)
                                    urls.append(full_url)
            except Exception as e:
                logger.debug(f"Error parsing __NEXT_DATA__: {e}")

        # Method 3: Extract URLs from any script containing lot data
        for script in soup.find_all("script"):
            script_text = script.string or ""
            if "apolloState" in script_text or '"Lot:' in script_text:
                # Find lot URLs
                lot_matches = re.findall(r'"url"\s*:\s*"(/encheres/immobilier/[^"]+_\d+)"', script_text)
                for lot_url in lot_matches:
                    full_url = self.normalize_url(lot_url)
                    if full_url not in seen:
                        if not self.departments or self._is_target_department(full_url):
                            seen.add(full_url)
                            urls.append(full_url)

        logger.info(f"[encheres_publiques] Page {page}: {len(urls)} auctions found")
        return urls

    def _is_target_department(self, url: str) -> bool:
        """Check if URL matches target departments.

        Returns True if:
        - No departments filter is set
        - URL contains a matching department code
        - URL doesn't have a visible department (we'll filter later on detail page)
        """
        if not self.departments:
            return True

        # Check for department pattern like -77/ or -13/
        match = re.search(r'-(\d{2})/', url)
        if match:
            return match.group(1) in self.departments

        # Check for postal codes in URL
        match = re.search(r'/(\d{5})/', url)
        if match:
            return match.group(1)[:2] in self.departments

        # If no department visible in URL (e.g., "vente-en-ligne"),
        # return True and filter later on detail page
        return True

    def scrape_detail_page(self, url: str) -> Optional[AuctionData]:
        """Scrape auction detail page."""
        soup = self.fetch_page(url)
        if not soup:
            return None

        # Skip notarial auctions
        if not self._is_judicial_auction(soup):
            logger.debug(f"Skipping notarial auction: {url}")
            return None

        auction = AuctionData()
        auction.source = self.SOURCE_NAME
        auction.url = url
        auction.source_id = self._extract_source_id(url)

        # Try to extract Apollo/Next.js data first (most reliable)
        apollo_data = self._extract_apollo_data(soup)

        if apollo_data:
            self._parse_apollo_data(apollo_data, auction)

        # Fallback/complement with HTML parsing
        self._parse_html_content(soup, auction)

        # Extract photos (multiple methods)
        self._extract_photos(soup, apollo_data, auction)

        # Extract visit dates
        self._extract_visit_dates(soup, apollo_data, auction)

        # Extract documents
        self._extract_documents(soup, apollo_data, auction)

        # Extract lawyer info
        self._extract_lawyer_info(soup, apollo_data, auction)

        return auction

    def _is_judicial_auction(self, soup: BeautifulSoup) -> bool:
        """Check if this is a judicial (not notarial) auction."""
        text = soup.get_text().lower()

        notarial_keywords = [
            "vente volontaire", "notaire", "notaires", "étude notariale",
            "office notarial", "vente amiable"
        ]
        judicial_keywords = [
            "tribunal judiciaire", "tribunal de grande instance", "vente judiciaire",
            "avocat poursuivant", "saisie immobilière", "vente sur licitation",
            "vente forcée", "adjudication judiciaire"
        ]

        has_notarial = any(kw in text for kw in notarial_keywords)
        has_judicial = any(kw in text for kw in judicial_keywords)

        if has_judicial:
            return True
        if has_notarial and not has_judicial:
            return False

        # Default to True if unclear
        return True

    def _extract_source_id(self, url: str) -> Optional[str]:
        """Extract source ID from URL."""
        match = re.search(r"_(\d+)$", url)
        return match.group(1) if match else None

    def _extract_apollo_data(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extract Apollo/Next.js GraphQL cache data.

        The structure is:
        __NEXT_DATA__.props.pageProps.apolloState.data = {
            'Lot:123456': { lot data },
            'LotVisite:xxx': { visit data },
            'Adresse:xxx': { address data },
            ...
        }
        """
        next_data_script = soup.find("script", id="__NEXT_DATA__")
        if next_data_script and next_data_script.string:
            try:
                data = json.loads(next_data_script.string)
                page_props = data.get("props", {}).get("pageProps", {})

                # The real data is in apolloState.data
                apollo_state = page_props.get("apolloState", {})
                apollo_data = apollo_state.get("data", {})

                if apollo_data:
                    return apollo_data

            except json.JSONDecodeError as e:
                logger.debug(f"Error parsing __NEXT_DATA__: {e}")

        return None

    def _parse_apollo_data(self, data: Dict, auction: AuctionData):
        """Parse Apollo cache data.

        Data structure:
        {
            'Lot:123456': { lot data with mise_a_prix, photos, visites refs, etc },
            'LotVisite:xxx': { start: timestamp, end: timestamp },
            'Adresse:xxx': { ville, text, coords, departement, etc },
            ...
        }
        """
        # Find the Lot entry
        lot_data = None
        lot_id = auction.source_id

        # Try to find by ID first
        if lot_id:
            lot_data = data.get(f"Lot:{lot_id}")

        # Fallback: find any Lot entry
        if not lot_data:
            for key, value in data.items():
                if key.startswith("Lot:") and isinstance(value, dict):
                    lot_data = value
                    break

        if not lot_data:
            logger.debug("No lot data found in Apollo cache")
            return

        logger.debug(f"Found lot data with keys: {list(lot_data.keys())[:10]}")

        # Title/Description
        if lot_data.get("nom"):
            raw_desc = lot_data["nom"]
            # Clean up prefix like "EN LIGNE∙"
            if "∙" in raw_desc:
                raw_desc = raw_desc.split("∙", 1)[-1].strip()
            auction.description = raw_desc

        # Detailed description
        if lot_data.get("description"):
            auction.description_detaillee = lot_data["description"]

        # Starting price - mise_a_prix is the actual field
        if lot_data.get("mise_a_prix"):
            try:
                auction.mise_a_prix = float(lot_data["mise_a_prix"])
            except (ValueError, TypeError):
                pass

        # Also check prix_plancher as fallback
        if not auction.mise_a_prix and lot_data.get("prix_plancher"):
            try:
                auction.mise_a_prix = float(lot_data["prix_plancher"])
            except (ValueError, TypeError):
                pass

        # Property type from sous_categorie
        if lot_data.get("sous_categorie"):
            auction.type_bien = lot_data["sous_categorie"]

        # Auction end date (fermeture_date is Unix timestamp)
        if lot_data.get("fermeture_date"):
            try:
                from datetime import datetime
                ts = float(lot_data["fermeture_date"])
                auction.date_vente = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                auction.heure_vente = datetime.fromtimestamp(ts).strftime("%H:%M")
            except (ValueError, TypeError):
                pass

        # Address - resolve reference
        addr_ref = None
        if isinstance(lot_data.get("adresse_physique"), dict):
            addr_ref = lot_data["adresse_physique"].get("__ref")
        elif isinstance(lot_data.get("adresse_defaut"), dict):
            addr_ref = lot_data["adresse_defaut"].get("__ref")

        if addr_ref and addr_ref in data:
            addr_data = data[addr_ref]
            auction.ville = addr_data.get("ville")
            auction.adresse = addr_data.get("text")
            auction.department = addr_data.get("departement")

            # Extract postal code from text (format: "24 D35, 77164 Ferrières-en-Brie, France")
            if auction.adresse:
                import re
                cp_match = re.search(r'\b(\d{5})\b', auction.adresse)
                if cp_match:
                    auction.code_postal = cp_match.group(1)
                    if not auction.department:
                        auction.department = auction.code_postal[:2]

            # Coordinates
            coords = addr_data.get("coords")
            if coords and isinstance(coords, list) and len(coords) == 2:
                auction.longitude = coords[0]
                auction.latitude = coords[1]

        # Extract surface from critere_surface_habitable
        if lot_data.get("critere_surface_habitable"):
            try:
                auction.surface = float(lot_data["critere_surface_habitable"])
            except (ValueError, TypeError):
                pass

        # Extract rooms
        if lot_data.get("critere_nombre_de_pieces"):
            try:
                auction.nb_pieces = int(lot_data["critere_nombre_de_pieces"])
            except (ValueError, TypeError):
                pass

        # Photos array
        photos_data = lot_data.get("photos", [])
        if isinstance(photos_data, list):
            for photo in photos_data:
                if isinstance(photo, dict) and photo.get("src"):
                    url = self.normalize_url(photo["src"])
                    if url not in auction.photos:
                        auction.photos.append(url)

        # Visit dates - resolve references
        visites_refs = lot_data.get("visites", [])
        if isinstance(visites_refs, list):
            for v in visites_refs:
                ref = None
                if isinstance(v, dict) and "__ref" in v:
                    ref = v["__ref"]
                elif isinstance(v, str) and v.startswith("LotVisite:"):
                    ref = v

                if ref and ref in data:
                    visite_data = data[ref]
                    # start is a Unix timestamp
                    start_ts = visite_data.get("start")
                    if start_ts:
                        try:
                            from datetime import datetime
                            visit_date = datetime.fromtimestamp(float(start_ts)).strftime("%Y-%m-%d")
                            if visit_date not in auction.dates_visite:
                                auction.dates_visite.append(visit_date)
                        except (ValueError, TypeError):
                            pass

    def _parse_html_content(self, soup: BeautifulSoup, auction: AuctionData):
        """Parse HTML content as fallback/complement."""
        text = soup.get_text()

        # Title/Description
        if not auction.description:
            title = soup.select_one("h1, .titre-vente, .page-title")
            if title:
                auction.description = title.get_text(strip=True)

        # Address
        if not auction.adresse:
            addr_elem = soup.select_one(".adresse, .localisation, [itemprop='address']")
            if addr_elem:
                auction.adresse = addr_elem.get_text(strip=True)
            elif auction.description:
                auction.adresse = auction.description

        # Postal code
        if not auction.code_postal:
            auction.code_postal = self.extract_postal_code(text)
            if auction.code_postal:
                auction.department = auction.code_postal[:2]

        # City from URL
        if not auction.ville and auction.url:
            match = re.search(r'/([a-z\-]+)-(\d{2})/', auction.url)
            if match:
                auction.ville = match.group(1).replace("-", " ").title()
                if not auction.department:
                    auction.department = match.group(2)

        # Property type
        if not auction.type_bien:
            auction.type_bien = self.detect_property_type(text)

        # Surface
        if not auction.surface:
            auction.surface = self.extract_surface(text)

        # Rooms
        if not auction.nb_pieces:
            match = re.search(r"(\d+)\s*(?:pièces?|p\.)", text, re.IGNORECASE)
            if match:
                auction.nb_pieces = int(match.group(1))

        # Mise à prix
        if not auction.mise_a_prix:
            match = re.search(r"mise\s+[àa]\s+prix\s*:?\s*([\d\s,\.]+)\s*€?", text, re.IGNORECASE)
            if match:
                auction.mise_a_prix = self.extract_price(match.group(1))

        # Date de vente
        if not auction.date_vente:
            patterns = [
                r"(?:vente|adjudication)\s+(?:le\s+)?(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
                r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\s+à\s+\d{1,2}h",
            ]
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    auction.date_vente = self.parse_french_date(match.group(1))
                    break

        # Time
        if not auction.heure_vente:
            auction.heure_vente = self.parse_time(text)

        # Tribunal
        if not auction.tribunal:
            tribunal_patterns = [
                r"tribunal\s+judiciaire\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)",
                r"TJ\s+(?:de\s+)?([A-ZÀ-Ü][a-zà-ü\-]+)",
            ]
            for pattern in tribunal_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    auction.tribunal = f"Tribunal Judiciaire de {match.group(1)}"
                    break

        # Detailed description
        if not auction.description_detaillee:
            desc_selectors = [
                ".description-bien", ".detail-bien", ".composition",
                ".content-description", ".bloc-description", ".lot-description"
            ]
            for selector in desc_selectors:
                elem = soup.select_one(selector)
                if elem:
                    auction.description_detaillee = elem.get_text(separator="\n", strip=True)
                    break

    def _extract_photos(self, soup: BeautifulSoup, apollo_data: Optional[Dict], auction: AuctionData):
        """Extract all photos from multiple sources."""
        photos = []
        seen = set()

        # Method 1: From Apollo data
        if apollo_data:
            for key, value in apollo_data.items():
                if isinstance(value, dict):
                    # Direct photos array
                    if "photos" in value and isinstance(value["photos"], list):
                        for photo in value["photos"]:
                            if isinstance(photo, str):
                                url = self.normalize_url(photo)
                                if url not in seen:
                                    seen.add(url)
                                    photos.append(url)
                            elif isinstance(photo, dict) and photo.get("url"):
                                url = self.normalize_url(photo["url"])
                                if url not in seen:
                                    seen.add(url)
                                    photos.append(url)

                    # Photo references
                    if key.startswith("LotPhoto:"):
                        photo_url = value.get("file") or value.get("url")
                        if photo_url:
                            url = self.normalize_url(f"/static/lot/photo/{photo_url}")
                            if url not in seen:
                                seen.add(url)
                                photos.append(url)

        # Method 2: From script tags (JSON patterns)
        for script in soup.find_all("script"):
            script_text = script.string or ""

            # Pattern 1: Direct photo URLs
            photo_matches = re.findall(r'/static/lot/photo/([A-Za-z0-9]+\.(?:jpg|jpeg|png|webp))', script_text, re.IGNORECASE)
            for photo_id in photo_matches:
                url = f"{self.BASE_URL}/static/lot/photo/{photo_id}"
                if url not in seen:
                    seen.add(url)
                    photos.append(url)

            # Pattern 2: Photo file names in JSON
            photo_matches = re.findall(r'"file"\s*:\s*"([A-Za-z0-9]+\.(?:jpg|jpeg|png|webp))"', script_text, re.IGNORECASE)
            for photo_file in photo_matches:
                url = f"{self.BASE_URL}/static/lot/photo/{photo_file}"
                if url not in seen:
                    seen.add(url)
                    photos.append(url)

            # Pattern 3: Full URLs in JSON
            photo_matches = re.findall(r'"(https?://[^"]+/(?:photo|image|img)/[^"]+\.(?:jpg|jpeg|png|webp))"', script_text, re.IGNORECASE)
            for url in photo_matches:
                if url not in seen:
                    seen.add(url)
                    photos.append(url)

        # Method 3: From image tags
        img_selectors = [
            ".gallery img", ".photos img", ".carousel img", ".swiper-slide img",
            ".lot-photos img", ".photo-gallery img", "[class*='photo'] img",
            "img.photo", "img.lot-photo"
        ]

        for selector in img_selectors:
            for img in soup.select(selector):
                # Try multiple attributes
                src = img.get("src") or img.get("data-src") or img.get("data-lazy") or img.get("data-original")

                if src:
                    # Handle Next.js image optimization URLs
                    if "/_next/image" in src:
                        url_match = re.search(r'url=([^&]+)', src)
                        if url_match:
                            src = unquote(url_match.group(1))

                    url = self.normalize_url(src)

                    # Filter out placeholders and icons
                    if url not in seen and not any(x in url.lower() for x in ["placeholder", "icon", "logo", "avatar", "pixel"]):
                        seen.add(url)
                        photos.append(url)

                # Check srcset for high-res images
                srcset = img.get("srcset", "")
                if srcset:
                    for part in srcset.split(","):
                        src_match = re.search(r'(https?://[^\s]+)', part)
                        if src_match:
                            if "/_next/image" in src_match.group(1):
                                url_match = re.search(r'url=([^&]+)', src_match.group(1))
                                if url_match:
                                    url = self.normalize_url(unquote(url_match.group(1)))
                                    if url not in seen:
                                        seen.add(url)
                                        photos.append(url)

        # Merge with existing photos (from Apollo data)
        for p in photos:
            if p not in auction.photos:
                auction.photos.append(p)

        # Limit to 30 photos
        auction.photos = auction.photos[:30]
        logger.debug(f"Total {len(auction.photos)} photos from {auction.url}")

    def _extract_visit_dates(self, soup: BeautifulSoup, apollo_data: Optional[Dict], auction: AuctionData):
        """Extract visit dates."""
        visit_dates = []
        text = soup.get_text()

        # Method 1: From Apollo data
        if apollo_data:
            for key, value in apollo_data.items():
                if isinstance(value, dict):
                    # Check for visit date fields
                    for field in ["dates_visite", "visites", "visit_dates", "creneaux_visite"]:
                        if field in value:
                            dates = value[field]
                            if isinstance(dates, list):
                                for d in dates:
                                    if isinstance(d, str):
                                        parsed = self.parse_french_date(d)
                                        if parsed and parsed not in visit_dates:
                                            visit_dates.append(parsed)
                                    elif isinstance(d, dict):
                                        date_str = d.get("date") or d.get("debut") or d.get("start")
                                        if date_str:
                                            parsed = self.parse_french_date(str(date_str))
                                            if parsed and parsed not in visit_dates:
                                                visit_dates.append(parsed)
                            elif isinstance(dates, str):
                                parsed = self.parse_french_date(dates)
                                if parsed and parsed not in visit_dates:
                                    visit_dates.append(parsed)

        # Method 2: From HTML content
        visit_patterns = [
            # "Visite le 15/01/2025"
            r"visite[s]?\s*(?:le|du|:)?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
            # "Visite : mercredi 15 janvier 2025"
            r"visite[s]?\s*:?\s*(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\.?\s*(\d{1,2}\s+\w+\s+\d{4})",
            # "Visites possibles le 15/01 et le 16/01"
            r"visite[s]?\s+possibles?\s+(?:le\s+)?(\d{1,2}[/\-\.]\d{1,2}(?:[/\-\.]\d{2,4})?)",
            # "Dates de visite : 15/01/2025, 16/01/2025"
            r"dates?\s+(?:de\s+)?visite[s]?\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        ]

        for pattern in visit_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                parsed = self.parse_french_date(match)
                if parsed and parsed not in visit_dates:
                    visit_dates.append(parsed)

        # Method 3: Look for visit sections in HTML
        visit_selectors = [".visite", ".dates-visite", ".visit-dates", "[class*='visite']"]
        for selector in visit_selectors:
            for elem in soup.select(selector):
                elem_text = elem.get_text()
                dates = re.findall(r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})", elem_text)
                for d in dates:
                    parsed = self.parse_french_date(d)
                    if parsed and parsed not in visit_dates:
                        visit_dates.append(parsed)

        # Merge with existing visit dates (from Apollo data)
        for d in visit_dates:
            if d not in auction.dates_visite:
                auction.dates_visite.append(d)

        auction.dates_visite = sorted(auction.dates_visite)
        logger.debug(f"Total {len(auction.dates_visite)} visit dates from {auction.url}")

    def _extract_documents(self, soup: BeautifulSoup, apollo_data: Optional[Dict], auction: AuctionData):
        """Extract documents (PV, cahier des charges, etc.)."""
        documents = []
        seen = set()

        # Method 1: From Apollo data
        if apollo_data:
            for key, value in apollo_data.items():
                if isinstance(value, dict):
                    if "documents" in value and isinstance(value["documents"], list):
                        for doc in value["documents"]:
                            if isinstance(doc, dict):
                                doc_entry = {
                                    "type": doc.get("type") or doc.get("nom") or "Document",
                                    "name": doc.get("nom") or doc.get("type") or "Document",
                                    "url": self.normalize_url(doc.get("file") or doc.get("url") or "")
                                }
                                if doc_entry["url"] and doc_entry["url"] not in seen:
                                    seen.add(doc_entry["url"])
                                    documents.append(doc_entry)

                                    # Check for PV
                                    if any(x in doc_entry["name"].lower() for x in ["procès", "pv", "proces-verbal"]):
                                        auction.pv_url = doc_entry["url"]

                    if key.startswith("LotDocument:"):
                        doc_url = value.get("file")
                        doc_name = value.get("nom", "Document")
                        if doc_url:
                            full_url = f"{self.BASE_URL}/static/lot/document/{doc_url}"
                            if full_url not in seen:
                                seen.add(full_url)
                                documents.append({
                                    "type": doc_name,
                                    "name": doc_name,
                                    "url": full_url
                                })
                                if any(x in doc_name.lower() for x in ["procès", "pv", "proces-verbal"]):
                                    auction.pv_url = full_url

        # Method 2: From script tags
        for script in soup.find_all("script"):
            script_text = script.string or ""

            # Pattern: "file": "xxx.pdf", "nom": "Document name"
            doc_matches = re.findall(
                r'"file"\s*:\s*"([^"]+\.pdf)"\s*,\s*"nom"\s*:\s*"([^"]+)"',
                script_text
            )
            for filename, nom in doc_matches:
                full_url = f"{self.BASE_URL}/static/lot/document/{filename}"
                if full_url not in seen:
                    seen.add(full_url)
                    documents.append({"type": nom, "name": nom, "url": full_url})
                    if any(x in nom.lower() for x in ["procès", "pv", "proces-verbal"]):
                        auction.pv_url = full_url

        # Method 3: From PDF links
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if ".pdf" in href.lower():
                full_url = self.normalize_url(href)
                if full_url not in seen:
                    link_text = link.get_text(strip=True) or "Document"
                    seen.add(full_url)
                    documents.append({"type": link_text, "name": link_text, "url": full_url})

        auction.documents = documents
        logger.debug(f"Extracted {len(auction.documents)} documents from {auction.url}")

    def _extract_lawyer_info(self, soup: BeautifulSoup, apollo_data: Optional[Dict], auction: AuctionData):
        """Extract lawyer contact information."""
        text = soup.get_text()

        # Method 1: From Apollo data
        if apollo_data:
            for key, value in apollo_data.items():
                if isinstance(value, dict):
                    # Look for lawyer/avocat info
                    if "avocat" in key.lower() or "organisateur" in key.lower():
                        auction.avocat_nom = value.get("nom") or value.get("name")
                        auction.avocat_email = value.get("email")
                        auction.avocat_telephone = value.get("telephone") or value.get("phone")

                    # Check nested
                    if "avocat" in value:
                        avocat = value["avocat"]
                        if isinstance(avocat, dict):
                            auction.avocat_nom = avocat.get("nom") or avocat.get("name")
                            auction.avocat_email = avocat.get("email")
                            auction.avocat_telephone = avocat.get("telephone") or avocat.get("phone")

        # Method 2: From HTML
        if not auction.avocat_nom:
            # Look for "Maître X" or "Me X"
            match = re.search(r"(?:Ma[îi]tre|Me|M[eE]\.)\s+([A-ZÀ-Ü][a-zà-ü\-]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)?)", text)
            if match:
                auction.avocat_nom = match.group(1)

        if not auction.avocat_email:
            auction.avocat_email = self.extract_email(text)

        if not auction.avocat_telephone:
            auction.avocat_telephone = self.extract_phone(text)


def run_scraper(db_path: str, departments: Optional[List[str]] = None, max_pages: int = 20) -> Dict[str, Any]:
    """Run the enhanced encheres-publiques scraper."""
    scraper = EncherePubliquesScraperV2(db_path, departments)
    try:
        return scraper.scrape(max_pages)
    finally:
        scraper.close()
