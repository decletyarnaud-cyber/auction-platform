"""
Scraper for encheres-publiques.com - Standalone version for FastAPI
"""
import re
import json
import time
import sqlite3
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from urllib.parse import unquote
import httpx
from bs4 import BeautifulSoup
from loguru import logger


class EncherePubliquesScraper:
    """Scraper for encheres-publiques.com"""

    BASE_URL = "https://www.encheres-publiques.com"

    # Target departments - configurable
    TARGET_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]  # Paris region

    def __init__(self, db_path: str, departments: Optional[List[str]] = None):
        self.db_path = db_path
        if departments:
            self.TARGET_DEPARTMENTS = departments
        self.client = httpx.Client(
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            }
        )

    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch and parse a page"""
        try:
            response = self.client.get(url)
            response.raise_for_status()
            return BeautifulSoup(response.text, "html.parser")
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def scrape_and_enrich(self, max_pages: int = 20) -> Dict[str, Any]:
        """Main entry point - scrape encheres-publiques and enrich existing DB records"""
        logger.info(f"Starting encheres-publiques scrape for departments: {self.TARGET_DEPARTMENTS}")

        # Get existing auctions from DB
        existing = self._get_existing_auctions()
        logger.info(f"Found {len(existing)} existing auctions in database")

        # Scrape listing pages
        scraped_urls = []
        enriched_count = 0
        new_count = 0

        for page in range(1, max_pages + 1):
            url = f"{self.BASE_URL}/encheres/immobilier?page={page}"
            soup = self.fetch_page(url)

            if not soup:
                break

            # Find auction URLs
            auction_urls = self._extract_auction_urls(soup)
            if not auction_urls:
                break

            logger.info(f"Page {page}: found {len(auction_urls)} auctions")

            # Filter for target departments
            for auction_url in auction_urls:
                dept_match = self._get_department_from_url(auction_url)
                if dept_match and dept_match in self.TARGET_DEPARTMENTS:
                    if auction_url not in scraped_urls:
                        scraped_urls.append(auction_url)

                        # Scrape detail page
                        data = self._scrape_detail(auction_url)
                        if data:
                            # Try to match with existing record
                            matched_id = self._find_matching_auction(data, existing)
                            if matched_id:
                                self._update_auction(matched_id, data)
                                enriched_count += 1
                            else:
                                # Insert as new record
                                self._insert_auction(data)
                                new_count += 1

                        time.sleep(0.5)  # Polite delay

            if len(auction_urls) < 10:
                break

        result = {
            "status": "completed",
            "pages_scraped": max_pages,
            "urls_found": len(scraped_urls),
            "enriched": enriched_count,
            "new": new_count
        }
        logger.info(f"Scrape completed: {result}")
        return result

    def _get_department_from_url(self, url: str) -> Optional[str]:
        """Extract department from URL pattern like marseille-13 or paris-75"""
        match = re.search(r'-(\d{2})/', url)
        return match.group(1) if match else None

    def _extract_auction_urls(self, soup: BeautifulSoup) -> List[str]:
        """Extract auction URLs from listing page"""
        urls = []
        seen = set()

        property_types = ["appartements", "maisons", "immeubles", "terrains",
                         "parkings", "locaux-commerciaux", "biens-exception"]

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if "/encheres/immobilier/" in href and "_" in href:
                if any(f"/encheres/immobilier/{ptype}/" in href for ptype in property_types):
                    full_url = href if href.startswith("http") else f"{self.BASE_URL}{href}"
                    if full_url not in seen:
                        seen.add(full_url)
                        urls.append(full_url)

        return urls

    def _scrape_detail(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape auction detail page"""
        soup = self.fetch_page(url)
        if not soup:
            return None

        # Skip notarial auctions
        if not self._is_judicial_auction(soup):
            return None

        data = {
            "url": url,
            "source": "encheres_publiques",
            "source_id": self._extract_source_id(url),
            "photos": [],
            "documents": [],
        }

        # Parse all sections
        self._parse_header(soup, data)
        self._parse_details(soup, data)
        self._parse_pricing(soup, data)
        self._parse_dates(soup, data)
        self._parse_detailed_description(soup, data)
        self._parse_photos(soup, data)
        self._parse_documents(soup, data)

        return data

    def _is_judicial_auction(self, soup: BeautifulSoup) -> bool:
        """Check if this is a judicial auction (not notarial)"""
        text = soup.get_text().lower()

        notarial_indicators = ["vente volontaire", "notaire", "notaires",
                              "étude notariale", "office notarial"]
        judicial_indicators = ["tribunal judiciaire", "tribunal de grande instance",
                              "vente judiciaire", "avocat poursuivant", "saisie immobilière"]

        has_notarial = any(ind in text for ind in notarial_indicators)
        has_judicial = any(ind in text for ind in judicial_indicators)

        if has_notarial and not has_judicial:
            return False
        if has_judicial:
            return True
        if "notaire" in text:
            return False
        return True

    def _extract_source_id(self, url: str) -> Optional[str]:
        """Extract source ID from URL"""
        match = re.search(r"_(\d+)$|/(\d+)(?:\?|$)", url)
        return (match.group(1) or match.group(2)) if match else None

    def _parse_header(self, soup: BeautifulSoup, data: Dict):
        """Parse header section"""
        title = soup.select_one("h1, .titre-vente, .page-title")
        if title:
            data["description"] = title.get_text(strip=True)

        address_elem = soup.select_one(".adresse, .localisation, [itemprop='address']")
        if address_elem:
            data["adresse"] = address_elem.get_text(strip=True)
        elif data.get("description"):
            data["adresse"] = data["description"]

        full_text = soup.get_text()

        # Postal code
        cp_match = re.search(r"\b(75\d{3}|77\d{3}|78\d{3}|91\d{3}|92\d{3}|93\d{3}|94\d{3}|95\d{3}|13\d{3}|83\d{3})\b", full_text)
        if cp_match:
            data["code_postal"] = cp_match.group(1)
            data["department"] = data["code_postal"][:2]

        # City from URL
        url_match = re.search(r'/([a-z\-]+)-(\d{2})/', data.get("url", ""))
        if url_match:
            if not data.get("department"):
                data["department"] = url_match.group(2)
            if not data.get("code_postal"):
                data["code_postal"] = f"{url_match.group(2)}000"
            if not data.get("ville"):
                data["ville"] = url_match.group(1).replace("-", " ").title()

    def _parse_details(self, soup: BeautifulSoup, data: Dict):
        """Parse property details"""
        text = soup.get_text().lower()

        # Property type
        type_map = {
            "appartement": ["appartement", "studio", "duplex", "loft"],
            "maison": ["maison", "villa", "pavillon"],
            "local commercial": ["local", "commerce", "bureau"],
            "terrain": ["terrain", "parcelle"],
            "parking": ["parking", "garage", "box"],
        }

        for prop_type, keywords in type_map.items():
            if any(kw in text for kw in keywords):
                data["type_bien"] = prop_type
                break

        # Surface
        surface_match = re.search(r"(\d+(?:[.,]\d+)?)\s*m[²2]", text)
        if surface_match:
            data["surface"] = float(surface_match.group(1).replace(",", "."))

        # Rooms
        pieces_match = re.search(r"(\d+)\s*(?:pièces?|p\.)", text)
        if pieces_match:
            data["nb_pieces"] = int(pieces_match.group(1))

    def _parse_pricing(self, soup: BeautifulSoup, data: Dict):
        """Parse pricing"""
        text = soup.get_text()

        # Mise à prix
        price_match = re.search(r"mise\s+[àa]\s+prix\s*:?\s*([\d\s,\.]+)\s*€?", text, re.IGNORECASE)
        if price_match:
            data["mise_a_prix"] = self._extract_price(price_match.group(1))

        # Try script data
        if not data.get("mise_a_prix"):
            for script in soup.find_all("script"):
                script_text = script.string or ""
                patterns = [r'"prix_plancher"\s*:\s*(\d+)', r'"mise_a_prix"\s*:\s*(\d+)']
                for pattern in patterns:
                    match = re.search(pattern, script_text)
                    if match:
                        data["mise_a_prix"] = float(match.group(1))
                        break
                if data.get("mise_a_prix"):
                    break

        # Tribunal
        tribunal_map = {
            "paris": "Tribunal Judiciaire de Paris",
            "versailles": "Tribunal Judiciaire de Versailles",
            "nanterre": "Tribunal Judiciaire de Nanterre",
            "bobigny": "Tribunal Judiciaire de Bobigny",
            "créteil": "Tribunal Judiciaire de Créteil",
            "marseille": "Tribunal Judiciaire de Marseille",
        }
        text_lower = soup.get_text().lower()
        for city, tribunal in tribunal_map.items():
            if city in text_lower:
                data["tribunal"] = tribunal
                break

    def _extract_price(self, text: str) -> Optional[float]:
        """Extract price from text"""
        cleaned = re.sub(r"[^\d,.]", "", text.replace(" ", ""))
        cleaned = cleaned.replace(",", ".")
        if cleaned.count(".") > 1:
            parts = cleaned.rsplit(".", 1)
            cleaned = parts[0].replace(".", "") + "." + parts[1]
        try:
            return float(cleaned)
        except ValueError:
            return None

    def _parse_dates(self, soup: BeautifulSoup, data: Dict):
        """Parse sale and visit dates"""
        text = soup.get_text()

        # Sale date
        date_patterns = [
            r"(?:vente|adjudication)\s+(?:le\s+)?(\d{1,2}/\d{1,2}/\d{4})",
            r"(\d{1,2}/\d{1,2}/\d{4})\s+à\s+\d{1,2}h",
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                data["date_vente"] = self._parse_date(match.group(1))
                break

        # Time
        time_match = re.search(r"à\s+(\d{1,2})[hH:](\d{0,2})", text)
        if time_match:
            data["heure_vente"] = f"{time_match.group(1)}h{time_match.group(2) or '00'}"

    def _parse_date(self, date_str: str) -> Optional[str]:
        """Parse date string to YYYY-MM-DD format"""
        match = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", date_str)
        if match:
            try:
                d = date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
                return d.isoformat()
            except ValueError:
                pass
        return None

    def _parse_detailed_description(self, soup: BeautifulSoup, data: Dict):
        """Parse detailed description"""
        desc_selectors = [".description-bien", ".detail-bien", ".composition",
                         ".content-description", ".bloc-description"]

        for selector in desc_selectors:
            elem = soup.select_one(selector)
            if elem:
                data["description_detaillee"] = elem.get_text(separator="\n", strip=True)
                return

        # Try JSON data in scripts
        for script in soup.find_all("script"):
            script_text = script.string or ""
            if "description" in script_text.lower():
                desc_match = re.search(r'"description"\s*:\s*"([^"]+)"', script_text)
                if desc_match:
                    desc = desc_match.group(1).replace("\\n", "\n").replace('\\"', '"')
                    data["description_detaillee"] = desc
                    return

    def _parse_photos(self, soup: BeautifulSoup, data: Dict):
        """Parse photo gallery URLs"""
        photos = []

        # Gallery images
        for img in soup.select(".gallery img, .photos img, .carousel img, .swiper-slide img"):
            src = img.get("src") or img.get("data-src") or img.get("data-lazy")
            if src:
                if not src.startswith("http"):
                    src = f"{self.BASE_URL}{src}"
                if src not in photos and "placeholder" not in src.lower():
                    photos.append(src)

        # Next.js images
        for img in soup.select("img.photo, .photos img"):
            srcset = img.get("srcset", "")
            if srcset and "/_next/image" in srcset:
                url_match = re.search(r'url=([^&]+)', srcset)
                if url_match:
                    original_url = unquote(url_match.group(1))
                    if original_url not in photos:
                        photos.append(original_url)

        # JSON data photos
        for script in soup.find_all("script"):
            script_text = script.string or ""
            photo_matches = re.findall(r'/static/lot/photo/[^"\']+\.jpg', script_text)
            for photo in photo_matches:
                full_url = f"{self.BASE_URL}{photo}"
                if full_url not in photos:
                    photos.append(full_url)

        data["photos"] = photos[:20]

    def _parse_documents(self, soup: BeautifulSoup, data: Dict):
        """Parse document links (PV, cahier des charges, etc.)"""
        documents = []

        # JSON data documents
        for script in soup.find_all("script"):
            script_text = script.string or ""
            if "LotDocument" in script_text:
                doc_matches = re.findall(
                    r'"file"\s*:\s*"([^"]+\.pdf)"\s*,\s*"nom"\s*:\s*"([^"]+)"',
                    script_text
                )
                for filename, nom in doc_matches:
                    full_url = f"{self.BASE_URL}/static/lot/document/{filename}"
                    doc_entry = {"type": nom, "name": nom, "url": full_url}
                    if doc_entry not in documents:
                        documents.append(doc_entry)
                        if "procès" in nom.lower() or "pv" in nom.lower():
                            data["pv_url"] = full_url

        # Fallback: PDF links
        if not documents:
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                text = link.get_text(strip=True)
                if ".pdf" in href.lower():
                    full_url = href if href.startswith("http") else f"{self.BASE_URL}{href}"
                    documents.append({"type": text or "Document", "name": text, "url": full_url})

        data["documents"] = documents

    def _get_existing_auctions(self) -> Dict[str, Dict]:
        """Get existing auctions from database indexed by various keys"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row

        try:
            rows = conn.execute("SELECT * FROM auctions").fetchall()
            existing = {}
            for row in rows:
                row_dict = dict(row)
                # Index by URL
                if row_dict.get("url"):
                    existing[row_dict["url"]] = row_dict
                # Index by source_id
                if row_dict.get("source_id"):
                    existing[f"source:{row_dict['source_id']}"] = row_dict
            return existing
        finally:
            conn.close()

    def _find_matching_auction(self, data: Dict, existing: Dict) -> Optional[int]:
        """Find matching existing auction"""
        # Match by URL
        if data.get("url") and data["url"] in existing:
            return existing[data["url"]]["id"]

        # Match by source ID
        if data.get("source_id"):
            key = f"source:{data['source_id']}"
            if key in existing:
                return existing[key]["id"]

        # Match by address similarity (basic)
        if data.get("adresse"):
            for key, row in existing.items():
                if isinstance(row, dict) and row.get("adresse"):
                    if data["adresse"].lower() in row["adresse"].lower():
                        return row["id"]

        return None

    def _update_auction(self, auction_id: int, data: Dict):
        """Update existing auction with enriched data"""
        conn = sqlite3.connect(self.db_path)

        try:
            # Build update fields
            updates = []
            params = []

            if data.get("photos"):
                updates.append("photos = ?")
                params.append(json.dumps(data["photos"]))

            if data.get("documents"):
                updates.append("documents = ?")
                params.append(json.dumps(data["documents"]))

            if data.get("description_detaillee"):
                updates.append("description_detaillee = ?")
                params.append(data["description_detaillee"])

            if data.get("pv_url"):
                updates.append("pv_url = ?")
                params.append(data["pv_url"])

            if updates:
                params.append(auction_id)
                query = f"UPDATE auctions SET {', '.join(updates)} WHERE id = ?"
                conn.execute(query, params)
                conn.commit()
                logger.info(f"Updated auction {auction_id} with photos/documents")

        finally:
            conn.close()

    def _insert_auction(self, data: Dict):
        """Insert new auction into database"""
        conn = sqlite3.connect(self.db_path)

        try:
            query = """
                INSERT INTO auctions (
                    source, source_id, url, adresse, code_postal, ville, department,
                    type_bien, surface, nb_pieces, description, description_detaillee,
                    mise_a_prix, date_vente, heure_vente, tribunal, photos, documents, pv_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            params = (
                data.get("source", "encheres_publiques"),
                data.get("source_id"),
                data.get("url"),
                data.get("adresse"),
                data.get("code_postal"),
                data.get("ville"),
                data.get("department"),
                data.get("type_bien"),
                data.get("surface"),
                data.get("nb_pieces"),
                data.get("description"),
                data.get("description_detaillee"),
                data.get("mise_a_prix"),
                data.get("date_vente"),
                data.get("heure_vente"),
                data.get("tribunal"),
                json.dumps(data.get("photos", [])),
                json.dumps(data.get("documents", [])),
                data.get("pv_url"),
            )
            conn.execute(query, params)
            conn.commit()
            logger.info(f"Inserted new auction: {data.get('adresse')}")

        except sqlite3.Error as e:
            logger.error(f"Failed to insert auction: {e}")

        finally:
            conn.close()


def run_scraper(db_path: str, departments: Optional[List[str]] = None, max_pages: int = 20) -> Dict[str, Any]:
    """Run the encheres-publiques scraper"""
    scraper = EncherePubliquesScraper(db_path, departments)
    return scraper.scrape_and_enrich(max_pages)
