"""
Listings scraper - fetches similar properties from multiple sources
Adapted from Streamlit immo-marseille project
Uses Playwright for sites with anti-bot protection (LeBonCoin)
"""
import re
import json
import time
import asyncio
import random
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict
import requests
from bs4 import BeautifulSoup

# Playwright for anti-bot sites (async API for FastAPI compatibility)
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("[Listings] Playwright not available, LeBonCoin will be limited")

DATA_DIR = Path("/Users/ade/projects/web/immo-marseille/data")
CACHE_FILE = DATA_DIR / "api_listings_cache.json"


class ListingsScraper:
    """Scrapes similar listings from multiple real estate sites"""

    CACHE_DURATION_HOURS = 12
    ASKING_PRICE_PREMIUM = 0.10  # 10% premium on asking prices

    # Zone tendue data (INSEE codes)
    ZONES_TENDUES_URL = "https://gitlab.com/pidila/sp-simulateurs-data/-/raw/master/donnees-de-reference/TaxeLogementVacant.json"
    _zones_tendues: Optional[Dict] = None

    def __init__(self):
        self._cache = self._load_cache()
        self._ma_estimate: Optional[Dict] = None
        self._session = requests.Session()
        self._session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
        })
        self._load_zones_tendues()

    def _load_cache(self) -> Dict:
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return {}

    def _save_cache(self):
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Listings] Cache save error: {e}")

    def _get_cache_key(self, postal_code: str, property_type: str, surface: Optional[float]) -> str:
        surface_range = f"{int((surface or 60) // 20) * 20}" if surface else "any"
        return hashlib.md5(f"{postal_code}_{property_type}_{surface_range}".encode()).hexdigest()

    def _is_cache_valid(self, entry: Dict) -> bool:
        if not entry.get('cached_at'):
            return False
        cached_at = datetime.fromisoformat(entry['cached_at'])
        return datetime.now() - cached_at < timedelta(hours=self.CACHE_DURATION_HOURS)

    async def get_similar_listings(
        self,
        postal_code: str,
        city: str,
        property_type: str,
        surface: Optional[float] = None,
    ) -> Dict:
        """Get similar listings from multiple sources"""
        cache_key = self._get_cache_key(postal_code, property_type, surface)

        # Check cache
        if cache_key in self._cache and self._is_cache_valid(self._cache[cache_key]):
            print(f"[Listings] Using cache for {postal_code}")
            return self._cache[cache_key]

        # Fetch from all sources
        all_listings = []
        sources_used = []

        # 1. LeBonCoin (async with Playwright)
        lbc = await self._fetch_leboncoin(postal_code, city, property_type, surface)
        if lbc:
            all_listings.extend(lbc)
            sources_used.append("LeBonCoin")
            print(f"[LeBonCoin] {len(lbc)} annonces")

        # 2. PAP.fr
        pap = self._fetch_pap(postal_code, city, property_type, surface)
        if pap:
            all_listings.extend(pap)
            sources_used.append("PAP")
            print(f"[PAP] {len(pap)} annonces")

        # 3. Bien'ici - with improved local filtering
        bienici = self._fetch_bienici(postal_code, city, property_type, surface)
        if bienici:
            all_listings.extend(bienici)
            sources_used.append("Bien'ici")
            print(f"[Bien'ici] {len(bienici)} annonces")

        # 4. SeLoger - DISABLED due to CloudFront anti-bot (403 Forbidden)
        # Would need specialized scraping service (Apify, ScrapFly, etc.)
        # print(f"[SeLoger] Disabled - CloudFront anti-bot protection")

        # 5. Logic-Immo (alternative)
        logicimmo = self._fetch_logicimmo(postal_code, city, property_type, surface)
        if logicimmo:
            all_listings.extend(logicimmo)
            sources_used.append("Logic-Immo")
            print(f"[Logic-Immo] {len(logicimmo)} annonces")

        # 5. MeilleursAgents (price estimates) - DISABLED due to aggressive anti-bot (DataDome)
        # The Playwright scraper gets blocked by CAPTCHA consistently
        # We have 3 reliable sources (DVF, Commune, LeBonCoin) which provide "high" reliability
        # print(f"[MeilleursAgents] Disabled - blocked by anti-bot protection")
        self._ma_estimate = None

        if not all_listings:
            print(f"[Listings] No results for {postal_code}, trying without surface filter")
            # Retry without surface filter
            lbc = await self._fetch_leboncoin(postal_code, city, property_type, None)
            if lbc:
                all_listings.extend(lbc)
                sources_used.append("LeBonCoin")

        if not all_listings:
            return {"listings": [], "prix_m2": None, "nb_listings": 0}

        # Calculate prices and validate location
        valid_prices = []
        comparables = []

        # Get department for validation
        dept = postal_code[:2]

        # Known cities that are NOT in PACA region (to filter out)
        excluded_keywords = ['paris', 'issy', 'bretonneux', 'lyon', 'bordeaux', 'lille', 'nantes',
                           'strasbourg', 'toulouse', 'rennes', 'montpellier', 'xlème', 'xème',
                           'invalides', 'luxembourg', 'auteuil', 'montparnasse']

        for listing in all_listings:
            prix = listing.get('prix')
            surf = listing.get('surface')
            titre = listing.get('titre', '').lower()

            # Skip listings from other regions (detect by title keywords)
            if any(kw in titre for kw in excluded_keywords):
                print(f"[Listings] Skipped non-local: {titre[:40]}")
                continue

            if prix and surf and surf > 0:
                prix_m2 = prix / surf
                if 500 <= prix_m2 <= 15000:
                    valid_prices.append(prix_m2)
                    comparables.append({
                        'titre': listing.get('titre', '')[:60],
                        'prix': prix,
                        'surface': surf,
                        'prix_m2': round(prix_m2, 0),
                        'url': listing.get('url', ''),
                        'source': listing.get('source', ''),
                    })

        if len(valid_prices) < 2:
            return {"listings": comparables, "prix_m2": None, "nb_listings": len(comparables)}

        # Median
        valid_prices.sort()
        n = len(valid_prices)
        median = valid_prices[n // 2] if n % 2 else (valid_prices[n // 2 - 1] + valid_prices[n // 2]) / 2

        # Apply correction
        corrected = median * (1 - self.ASKING_PRICE_PREMIUM)

        # Sort by proximity to median
        comparables.sort(key=lambda x: abs(x['prix_m2'] - median))

        sources_str = ", ".join(sources_used)

        # Get tension locative data
        tension = self.get_tension_locative(postal_code)

        result = {
            "listings": comparables[:35],  # Show up to 35 listings
            "prix_m2": round(corrected, 0),
            "prix_m2_raw": round(median, 0),
            "nb_listings": len(valid_prices),
            "sources": sources_used,
            "notes": f"Prix demandés -10% ({len(valid_prices)} annonces via {sources_str})",
            "source_url": f"https://www.leboncoin.fr/recherche?category=9&locations={postal_code}",
            "cached_at": datetime.now().isoformat(),
            # Tension locative
            "tension_locative": tension,
            # MeilleursAgents estimate (if available)
            "meilleursagents": getattr(self, '_ma_estimate', None),
        }

        # Cache
        self._cache[cache_key] = result
        self._save_cache()

        return result

    async def _fetch_leboncoin(self, postal_code: str, city: str, property_type: str, surface: Optional[float]) -> List[Dict]:
        """Fetch from LeBonCoin using their internal API (same as Streamlit version)"""
        type_mapping = {
            'appartement': '2',
            'maison': '1',
            'apartment': '2',
            'house': '1',
            'terrain': '3',
            'parking': '4',
        }
        real_estate_type = type_mapping.get(property_type.lower(), '2')

        try:
            api_url = "https://api.leboncoin.fr/finder/search"

            payload = {
                "limit": 35,
                "limit_alu": 3,
                "filters": {
                    "category": {"id": "9"},
                    "location": {
                        "locations": [{"zipcode": postal_code}]
                    },
                    "keywords": {},
                    "ranges": {},
                    "enums": {
                        "real_estate_type": [real_estate_type]
                    }
                }
            }

            if surface:
                payload["filters"]["ranges"]["square"] = {
                    "min": int(surface * 0.7),
                    "max": int(surface * 1.3)
                }

            headers = {
                'Content-Type': 'application/json',
                'api_key': 'ba0c2dad52b3ec',
                'Accept': 'application/json',
                'User-Agent': 'LBC;Android;6.32.2;Google;sdk_gphone_x86;29;1080x1920',
            }

            print(f"[LeBonCoin] Calling API for {postal_code}")
            response = self._session.post(
                api_url,
                json=payload,
                headers=headers,
                timeout=10
            )

            if response.status_code != 200:
                print(f"[LeBonCoin] API returned {response.status_code}")
                return []

            data = response.json()
            ads = data.get('ads', [])
            print(f"[LeBonCoin] API returned {len(ads)} ads")

            listings = []
            for ad in ads:
                try:
                    prix = ad.get('price', [None])
                    if isinstance(prix, list):
                        prix = prix[0] if prix else None

                    surface_val = None
                    for attr in ad.get('attributes', []):
                        if attr.get('key') == 'square':
                            surface_val = float(attr.get('value', 0))
                            break

                    if prix and surface_val and surface_val > 0:
                        listings.append({
                            'titre': ad.get('subject', '')[:60],
                            'prix': float(prix),
                            'surface': surface_val,
                            'url': f"https://www.leboncoin.fr/ad/ventes_immobilieres/{ad.get('list_id')}",
                            'source': 'LeBonCoin',
                        })
                except:
                    continue

            return listings

        except Exception as e:
            print(f"[LeBonCoin] API error: {e}")
            return []

    def _fetch_logicimmo(self, postal_code: str, city: str, property_type: str, surface: Optional[float]) -> List[Dict]:
        """Fetch from Logic-Immo"""
        type_mapping = {'appartement': 'appartement', 'maison': 'maison', 'apartment': 'appartement', 'house': 'maison'}
        prop_type = type_mapping.get(property_type.lower(), 'appartement')

        try:
            time.sleep(random.uniform(0.3, 0.6))

            # Build URL
            dept = postal_code[:2]
            url = f"https://www.logic-immo.com/vente-immobilier-{dept}/options/groupprptypesalialialialialialialialialiaadb"

            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9',
            })

            response = session.get(url, timeout=15)
            if response.status_code != 200:
                return []

            soup = BeautifulSoup(response.text, 'html.parser')
            listings = []

            # Parse cards
            cards = soup.select('.offer-list-item, .announcement-item, article.offer')
            for card in cards[:15]:
                try:
                    text = card.get_text(' ', strip=True)

                    # Check if it's in the right postal code
                    if postal_code not in text and postal_code[:2] not in text:
                        continue

                    # Price
                    price_match = re.search(r'([\d\s]{5,})\s*€', text.replace('\xa0', ' '))
                    if not price_match:
                        continue
                    prix = float(price_match.group(1).replace(' ', ''))
                    if prix < 10000:
                        continue

                    # Surface
                    surf_match = re.search(r'(\d+(?:[.,]\d+)?)\s*m²', text)
                    if not surf_match:
                        continue
                    surface_val = float(surf_match.group(1).replace(',', '.'))

                    # URL
                    link = card.select_one('a[href*="/detail"]') or card.select_one('a[href]')
                    url_val = ''
                    if link and link.get('href'):
                        href = link.get('href')
                        url_val = f"https://www.logic-immo.com{href}" if href.startswith('/') else href

                    listings.append({
                        'titre': f"Bien {surface_val}m²",
                        'prix': prix,
                        'surface': surface_val,
                        'url': url_val,
                        'source': 'Logic-Immo',
                    })
                except:
                    continue

            return listings

        except Exception as e:
            print(f"[Logic-Immo] Error: {e}")
            return []

    def _fetch_pap(self, postal_code: str, city: str, property_type: str, surface: Optional[float]) -> List[Dict]:
        """Fetch from PAP.fr"""
        type_mapping = {'appartement': 'appartement', 'maison': 'maison', 'apartment': 'appartement', 'house': 'maison'}
        prop_type = type_mapping.get(property_type.lower(), 'appartement')

        try:
            time.sleep(random.uniform(0.3, 0.8))

            # Build URL
            city_slug = city.lower().replace(' ', '-').replace("'", '-').replace('è', 'e').replace('é', 'e')
            dept = postal_code[:2]
            url = f"https://www.pap.fr/annonce/vente-{prop_type}s-{city_slug}-{dept}"

            if surface:
                url += f"-a-partir-de-{int(surface * 0.7)}-m2-jusqu-a-{int(surface * 1.3)}-m2"

            session = requests.Session()
            session.headers.update({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Referer': 'https://www.google.fr/',
            })

            # Get cookies first
            try:
                session.get('https://www.pap.fr/', timeout=10)
                time.sleep(random.uniform(0.2, 0.5))
            except:
                pass

            response = session.get(url, timeout=15)

            if response.status_code != 200:
                # Fallback to simpler URL
                url = f"https://www.pap.fr/annonce/vente-{prop_type}s-{dept}"
                response = session.get(url, timeout=15)
                if response.status_code != 200:
                    return []

            soup = BeautifulSoup(response.text, 'html.parser')
            listings = []

            # Parse cards
            cards = soup.select('.search-list-item, [class*="search-results"] article, .item-listing, article[class*="item"]')

            if not cards:
                # Fallback: find elements with price patterns
                all_divs = soup.find_all(['div', 'article', 'li'], class_=True)
                for div in all_divs:
                    text = div.get_text()
                    if re.search(r'\d{2,3}\s*\d{3}\s*€', text) and 'm²' in text:
                        cards.append(div)
                    if len(cards) >= 15:
                        break

            for card in cards[:15]:
                try:
                    text = card.get_text(' ', strip=True)

                    # Price
                    price_match = re.search(r'([\d\s]{5,})\s*€', text.replace('\xa0', ' '))
                    if not price_match:
                        continue
                    prix = float(price_match.group(1).replace(' ', ''))
                    if prix < 10000:
                        continue

                    # Surface
                    surf_match = re.search(r'(\d+(?:[.,]\d+)?)\s*m²', text)
                    if not surf_match:
                        continue
                    surface_val = float(surf_match.group(1).replace(',', '.'))

                    # URL
                    link = card.select_one('a[href*="/annonces/"]') or card.select_one('a[href]')
                    url_val = ''
                    if link and link.get('href'):
                        href = link.get('href')
                        url_val = f"https://www.pap.fr{href}" if href.startswith('/') else href

                    listings.append({
                        'titre': f"{prop_type.capitalize()} {surface_val}m²",
                        'prix': prix,
                        'surface': surface_val,
                        'url': url_val,
                        'source': 'PAP',
                    })
                except:
                    continue

            return listings

        except Exception as e:
            print(f"[PAP] Error: {e}")
            return []

    def _fetch_seloger(self, postal_code: str, city: str, property_type: str, surface: Optional[float]) -> List[Dict]:
        """Fetch from SeLoger - uses their new classified-search endpoint"""
        type_mapping = {
            'appartement': 'Apartment', 'maison': 'House', 'apartment': 'Apartment', 'house': 'House',
        }
        prop_type = type_mapping.get(property_type.lower(), 'Apartment')
        dept = postal_code[:2]

        try:
            time.sleep(random.uniform(0.5, 1.0))

            # SeLoger new search URL format
            # Format: https://www.seloger.com/immobilier/achat/immo-paris-9eme-75/
            city_slug = city.lower().replace(' ', '-').replace("'", '-')
            city_slug = re.sub(r'[àâä]', 'a', city_slug)
            city_slug = re.sub(r'[éèêë]', 'e', city_slug)
            city_slug = re.sub(r'[îï]', 'i', city_slug)
            city_slug = re.sub(r'[ôö]', 'o', city_slug)
            city_slug = re.sub(r'[ùûü]', 'u', city_slug)
            city_slug = re.sub(r'[ç]', 'c', city_slug)
            city_slug = re.sub(r'[^a-z0-9-]', '', city_slug)

            url = f"https://www.seloger.com/immobilier/achat/immo-{city_slug}-{dept}/"

            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }

            response = self._session.get(url, headers=headers, timeout=15, allow_redirects=True)

            if response.status_code != 200:
                print(f"[SeLoger] HTTP {response.status_code} for {url}")
                return []

            # Check for anti-bot
            if 'datadome' in response.text.lower() or 'captcha' in response.text.lower():
                print(f"[SeLoger] Anti-bot protection detected")
                return []

            soup = BeautifulSoup(response.text, 'html.parser')
            listings = []

            # Try to find embedded JSON data (window["initialData"])
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and 'window["initialData"]' in script.string:
                    try:
                        match = re.search(r'window\["initialData"\]\s*=\s*(\{.*?\});', script.string, re.DOTALL)
                        if match:
                            data = json.loads(match.group(1))
                            cards = data.get('cards', {}).get('list', [])
                            for card in cards[:20]:
                                try:
                                    price = card.get('price')
                                    area = card.get('livingArea')
                                    if price and area:
                                        listings.append({
                                            'titre': card.get('title', f"Bien {area}m²")[:60],
                                            'prix': float(price),
                                            'surface': float(area),
                                            'url': f"https://www.seloger.com{card.get('url', '')}",
                                            'source': 'SeLoger',
                                        })
                                except:
                                    continue
                    except:
                        pass

            # Fallback: parse HTML if JSON not found
            if not listings:
                cards = soup.select('[class*="listing"], [class*="Card"], article')
                for card in cards[:15]:
                    try:
                        text = card.get_text(' ', strip=True)
                        if postal_code not in text and dept not in text:
                            continue

                        price_match = re.search(r'([\d\s]{5,})\s*€', text.replace('\xa0', ' '))
                        surf_match = re.search(r'(\d+(?:[.,]\d+)?)\s*m²', text)

                        if price_match and surf_match:
                            prix = float(price_match.group(1).replace(' ', ''))
                            surface_val = float(surf_match.group(1).replace(',', '.'))
                            if prix > 10000 and surface_val > 5:
                                listings.append({
                                    'titre': f"Bien {surface_val}m²",
                                    'prix': prix,
                                    'surface': surface_val,
                                    'url': url,
                                    'source': 'SeLoger',
                                })
                    except:
                        continue

            return listings

        except Exception as e:
            print(f"[SeLoger] Error: {e}")
            return []

    def _fetch_bienici(self, postal_code: str, city: str, property_type: str, surface: Optional[float]) -> List[Dict]:
        """Fetch from Bien'ici API - with strict location filtering"""
        type_mapping = {'appartement': 'flat', 'maison': 'house', 'apartment': 'flat', 'house': 'house'}
        prop_type = type_mapping.get(property_type.lower(), 'flat')

        # Get department for filtering
        dept = postal_code[:2]
        city_lower = city.lower() if city else ""

        try:
            filters = {
                "size": 50,  # Fetch more to filter locally
                "from": 0,
                "filterType": "buy",
                "propertyType": [prop_type],
                "postalCodes": [postal_code],
                "sortBy": "relevance",
                "sortOrder": "desc",
            }

            if surface:
                filters["minArea"] = int(surface * 0.7)
                filters["maxArea"] = int(surface * 1.3)

            response = self._session.get(
                "https://www.bienici.com/realEstateAds.json",
                params={"filters": json.dumps(filters)},
                timeout=15,
                headers={
                    'Accept': 'application/json',
                    'Referer': 'https://www.bienici.com/',
                }
            )

            if response.status_code != 200:
                print(f"[Bien'ici] HTTP {response.status_code}")
                return []

            data = response.json()
            listings = []

            for ad in data.get('realEstateAds', [])[:50]:
                try:
                    prix = ad.get('price')
                    surface_val = ad.get('surfaceArea')

                    # Get location info from ad
                    ad_city = (ad.get('city') or '').lower()
                    ad_postal = ad.get('postalCode') or ''
                    ad_dept = ad_postal[:2] if ad_postal else ''

                    # STRICT FILTER: Only include if same postal code OR same city OR same department
                    location_match = (
                        ad_postal == postal_code or  # Exact postal code match
                        ad_city == city_lower or  # Same city
                        ad_dept == dept  # Same department (any region)
                    )

                    if not location_match:
                        print(f"[Bien'ici] Skipped {ad_city} ({ad_postal}) - not in {city} ({postal_code})")
                        continue

                    if prix and surface_val:
                        listings.append({
                            'titre': ad.get('title', f"Bien à {ad_city or city}"),
                            'prix': float(prix),
                            'surface': float(surface_val),
                            'url': f"https://www.bienici.com/annonce/{ad.get('id', '')}",
                            'source': "Bien'ici",
                        })
                except:
                    continue

            return listings

        except Exception as e:
            print(f"[Bien'ici] Error: {e}")
            return []

    async def _fetch_meilleursagents_playwright(self, postal_code: str, city: str, property_type: str) -> Optional[Dict]:
        """Fetch price estimate from MeilleursAgents using Playwright (async)"""
        if not PLAYWRIGHT_AVAILABLE:
            print("[MeilleursAgents] Playwright not available")
            return None

        type_mapping = {'appartement': 'appartement', 'maison': 'maison', 'apartment': 'appartement', 'house': 'maison'}
        prop_type = type_mapping.get(property_type.lower(), 'appartement')

        try:
            # Normalize city name for URL
            city_slug = city.lower().replace(' ', '-').replace("'", '-')
            city_slug = re.sub(r'[àâä]', 'a', city_slug)
            city_slug = re.sub(r'[éèêë]', 'e', city_slug)
            city_slug = re.sub(r'[îï]', 'i', city_slug)
            city_slug = re.sub(r'[ôö]', 'o', city_slug)
            city_slug = re.sub(r'[ùûü]', 'u', city_slug)
            city_slug = re.sub(r'[ç]', 'c', city_slug)
            city_slug = re.sub(r'[^a-z0-9-]', '', city_slug)

            url = f"https://www.meilleursagents.com/prix-immobilier/{city_slug}-{postal_code}/"

            print(f"[MeilleursAgents] Loading {url}")

            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                    ]
                )

                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    locale='fr-FR',
                    timezone_id='Europe/Paris',
                )

                # Add stealth scripts
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                    Object.defineProperty(navigator, 'languages', {get: () => ['fr-FR', 'fr', 'en']});
                    Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                    window.chrome = {runtime: {}};
                """)

                page = await context.new_page()

                # Navigate with realistic behavior
                await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(random.randint(2000, 4000))

                # Check for CAPTCHA
                content = await page.content()
                if 'captcha-delivery.com' in content or 'challenge' in content.lower():
                    print("[MeilleursAgents] CAPTCHA detected, waiting...")
                    await page.wait_for_timeout(5000)
                    content = await page.content()

                await browser.close()

                # Parse the content
                soup = BeautifulSoup(content, 'html.parser')
                text = soup.get_text(' ', strip=True)

                result = {
                    'source': 'MeilleursAgents',
                    'url': url,
                }

                # Try to find price patterns
                # Pattern 1: "2 500 €/m²" for apartments
                apt_patterns = [
                    r'[Aa]ppartement[s]?\s*(?:ancien[s]?)?\s*:?\s*([\d\s]+)\s*€\s*/\s*m[²2]',
                    r'[Aa]ppartement[s]?\s*([\d\s]+)\s*€/m²',
                    r'Prix\s+moyen\s+appartement[s]?\s*:?\s*([\d\s]+)\s*€',
                ]
                for pattern in apt_patterns:
                    match = re.search(pattern, text)
                    if match:
                        price_str = match.group(1).replace(' ', '').replace('\xa0', '')
                        if price_str.isdigit():
                            result['prix_m2_appartement'] = float(price_str)
                            break

                # Pattern 2: Houses
                house_patterns = [
                    r'[Mm]aison[s]?\s*(?:ancienne[s]?)?\s*:?\s*([\d\s]+)\s*€\s*/\s*m[²2]',
                    r'[Mm]aison[s]?\s*([\d\s]+)\s*€/m²',
                ]
                for pattern in house_patterns:
                    match = re.search(pattern, text)
                    if match:
                        price_str = match.group(1).replace(' ', '').replace('\xa0', '')
                        if price_str.isdigit():
                            result['prix_m2_maison'] = float(price_str)
                            break

                # Pattern 3: Generic price
                generic_patterns = [
                    r'([\d\s]{3,})\s*€\s*/\s*m[²2]',
                    r'prix.{0,30}([\d\s]{4,})\s*€',
                ]
                if not result.get('prix_m2_appartement') and not result.get('prix_m2_maison'):
                    for pattern in generic_patterns:
                        matches = re.findall(pattern, text, re.IGNORECASE)
                        for match in matches:
                            price_str = match.replace(' ', '').replace('\xa0', '')
                            if price_str.isdigit():
                                price = float(price_str)
                                if 500 <= price <= 20000:  # Reasonable €/m² range
                                    result['prix_m2'] = price
                                    break
                        if result.get('prix_m2'):
                            break

                # Rental price (loyer)
                loyer_patterns = [
                    r'[Ll]oyer[s]?\s*(?:moyen[s]?)?\s*:?\s*([\d\s]+)\s*€\s*/\s*m[²2]',
                    r'[Ll]ocation\s*:?\s*([\d\s]+)\s*€\s*/\s*m[²2]',
                ]
                for pattern in loyer_patterns:
                    match = re.search(pattern, text)
                    if match:
                        price_str = match.group(1).replace(' ', '').replace('\xa0', '')
                        if price_str.isdigit():
                            result['loyer_m2'] = float(price_str)
                            break

                # Set main price based on property type
                if prop_type == 'appartement' and result.get('prix_m2_appartement'):
                    result['prix_m2'] = result['prix_m2_appartement']
                elif prop_type == 'maison' and result.get('prix_m2_maison'):
                    result['prix_m2'] = result['prix_m2_maison']

                if result.get('prix_m2') or result.get('prix_m2_appartement') or result.get('prix_m2_maison'):
                    print(f"[MeilleursAgents] Found: {result}")
                    return result

                print("[MeilleursAgents] No price data found in page")
                return None

        except Exception as e:
            print(f"[MeilleursAgents] Playwright error: {e}")
            return None

    def _load_zones_tendues(self):
        """Load zone tendue data from data.gouv.fr"""
        cache_file = DATA_DIR / "zones_tendues_cache.json"

        # Check cache first
        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if data.get('cached_at'):
                        cached_at = datetime.fromisoformat(data['cached_at'])
                        if datetime.now() - cached_at < timedelta(days=30):
                            ListingsScraper._zones_tendues = data.get('zones', {})
                            print(f"[ZonesTendues] Loaded {len(ListingsScraper._zones_tendues)} communes from cache")
                            return
            except:
                pass

        try:
            response = requests.get(self.ZONES_TENDUES_URL, timeout=15)
            if response.status_code != 200:
                print(f"[ZonesTendues] HTTP {response.status_code}")
                return

            data = response.json()
            zones = {}

            # Process both categories
            for commune in data.get('PlusDe50000', []):
                code = commune.get('codeInsee', '')
                if code:
                    zones[code] = {
                        'nom': commune.get('Nom', ''),
                        'tension': 'tres_tendue',
                        'niveau': 3,
                        'label': 'Très tendue (>50k déséquilibre)',
                    }

            for commune in data.get('DesequilibreOffreEtDemande', []):
                code = commune.get('codeInsee', '')
                if code and code not in zones:  # Don't override higher tension
                    zones[code] = {
                        'nom': commune.get('Nom', ''),
                        'tension': 'tendue',
                        'niveau': 2,
                        'label': 'Tendue (déséquilibre offre/demande)',
                    }

            ListingsScraper._zones_tendues = zones
            print(f"[ZonesTendues] Loaded {len(zones)} communes from API")

            # Cache it
            cache_data = {
                'zones': zones,
                'cached_at': datetime.now().isoformat(),
            }
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"[ZonesTendues] Error: {e}")

    def get_tension_locative(self, postal_code: str) -> Dict:
        """Get rental tension data for a postal code"""
        # Convert postal code to INSEE code (approximate - first 5 digits often match)
        # For more accuracy, we'd need a postal code to INSEE mapping
        insee_code = postal_code

        if ListingsScraper._zones_tendues and insee_code in ListingsScraper._zones_tendues:
            return ListingsScraper._zones_tendues[insee_code]

        # Check if any commune in this department is in zone tendue
        dept = postal_code[:2]
        dept_communes = [
            (k, v) for k, v in (ListingsScraper._zones_tendues or {}).items()
            if k.startswith(dept)
        ]

        if dept_communes:
            # Return department-level info
            max_tension = max(dept_communes, key=lambda x: x[1]['niveau'])
            return {
                'tension': 'departement_tendu',
                'niveau': 1,
                'label': f"Département avec zones tendues ({len(dept_communes)} communes)",
                'communes_tendues': len(dept_communes),
            }

        return {
            'tension': 'non_tendue',
            'niveau': 0,
            'label': 'Zone non tendue',
        }


# Singleton
_scraper: Optional[ListingsScraper] = None


def get_listings_scraper() -> ListingsScraper:
    global _scraper
    if _scraper is None:
        _scraper = ListingsScraper()
    return _scraper
