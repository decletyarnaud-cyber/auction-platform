"""
DVF (Demandes de Valeurs Foncières) Data Enrichment Service

This service uses local DVF CSV files downloaded from data.gouv.fr
to provide accurate market prices for properties.

Data source: https://files.data.gouv.fr/geo-dvf/latest/csv/
"""

import csv
import os
from datetime import datetime, timedelta, date
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from pathlib import Path
from functools import lru_cache


@dataclass
class DVFTransaction:
    """Represents a real estate transaction from DVF data."""
    date: str
    price: float
    surface: Optional[float]
    price_per_sqm: Optional[float]
    property_type: str
    rooms: Optional[int]
    postal_code: str
    commune: str
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]


@dataclass
class MarketAnalysis:
    """Market analysis result for a location."""
    median_price_per_sqm: float
    avg_price_per_sqm: float
    min_price_per_sqm: float
    max_price_per_sqm: float
    transaction_count: int
    period_months: int
    confidence: str  # "high", "medium", "low"
    last_updated: str


class DVFEnrichmentService:
    """Service to enrich property data with DVF market prices using local CSV files."""

    # Path to DVF data files (from the Streamlit app)
    DVF_DATA_DIR = Path("/Users/ade/projects/web/immo-marseille/data/dvf")

    def __init__(self):
        self._cache: Dict[str, List[DVFTransaction]] = {}
        self._analysis_cache: Dict[str, MarketAnalysis] = {}

    def _get_department_from_postal(self, postal_code: str) -> str:
        """Extract department from postal code."""
        if not postal_code or len(postal_code) < 2:
            return ""
        return postal_code[:2]

    def _load_dvf_data(self, department: str) -> List[DVFTransaction]:
        """Load DVF data from local CSV files for a department."""
        cache_key = department
        if cache_key in self._cache:
            return self._cache[cache_key]

        transactions = []

        # Load all years available
        for year in [2022, 2023, 2024]:
            file_path = self.DVF_DATA_DIR / f"dvf_{department}_{year}.csv"
            if not file_path.exists():
                continue

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        try:
                            tx = self._parse_row(row)
                            if tx:
                                transactions.append(tx)
                        except Exception:
                            continue
            except Exception as e:
                print(f"Error loading DVF file {file_path}: {e}")

        self._cache[cache_key] = transactions
        print(f"Loaded {len(transactions)} DVF transactions for department {department}")
        return transactions

    def _parse_row(self, row: Dict[str, str]) -> Optional[DVFTransaction]:
        """Parse a CSV row into a DVFTransaction."""
        try:
            # Parse price
            price_str = row.get("valeur_fonciere", "").replace(",", ".")
            if not price_str:
                return None
            price = float(price_str)
            if price <= 0:
                return None

            # Parse surface
            surface_str = row.get("surface_reelle_bati", "").replace(",", ".")
            surface = float(surface_str) if surface_str else None

            # Calculate price per sqm
            price_per_sqm = (price / surface) if surface and surface > 0 else None

            # Parse rooms
            rooms_str = row.get("nombre_pieces_principales", "")
            rooms = int(rooms_str) if rooms_str.isdigit() else None

            # Build address
            numero = row.get("adresse_numero", "") or row.get("no_voie", "")
            voie = row.get("adresse_nom_voie", "") or row.get("voie", "")
            address = f"{numero} {voie}".strip()

            # Coordinates
            lat_str = row.get("latitude", "")
            lon_str = row.get("longitude", "")
            lat = float(lat_str) if lat_str else None
            lon = float(lon_str) if lon_str else None

            return DVFTransaction(
                date=row.get("date_mutation", ""),
                price=price,
                surface=surface,
                price_per_sqm=price_per_sqm,
                property_type=row.get("type_local", ""),
                rooms=rooms,
                postal_code=row.get("code_postal", ""),
                commune=row.get("nom_commune", "") or row.get("commune", ""),
                address=address if address else None,
                latitude=lat,
                longitude=lon,
            )
        except Exception:
            return None

    async def get_transactions(
        self,
        postal_code: str,
        property_type: Optional[str] = None,
        months_back: int = 24,
        limit: int = 100
    ) -> List[DVFTransaction]:
        """
        Get DVF transactions for a given postal code.
        """
        department = self._get_department_from_postal(postal_code)
        if not department:
            return []

        all_transactions = self._load_dvf_data(department)

        # Calculate date limit
        date_limit = (datetime.now() - timedelta(days=months_back * 30)).strftime("%Y-%m-%d")

        # Map property type
        type_mapping = {
            "apartment": "Appartement",
            "appartement": "Appartement",
            "house": "Maison",
            "maison": "Maison",
            "land": "Terrain",
            "terrain": "Terrain",
            "commercial": "Local",
        }
        dvf_type = type_mapping.get((property_type or "").lower(), None)

        # Filter transactions
        filtered = []
        for tx in all_transactions:
            # Filter by postal code
            if tx.postal_code != postal_code:
                continue

            # Filter by date
            if tx.date < date_limit:
                continue

            # Filter by property type if specified
            if dvf_type and dvf_type.lower() not in tx.property_type.lower():
                continue

            # Must have valid price per sqm
            if not tx.price_per_sqm or tx.price_per_sqm <= 0:
                continue

            filtered.append(tx)

        # Sort by date (most recent first) and limit
        filtered.sort(key=lambda t: t.date, reverse=True)
        return filtered[:limit]

    async def get_market_price(
        self,
        postal_code: str,
        property_type: Optional[str] = None,
        surface: Optional[float] = None,
        rooms: Optional[int] = None,
    ) -> Optional[MarketAnalysis]:
        """Calculate market price estimation for a location."""
        cache_key = f"{postal_code}_{property_type or 'all'}"

        # Check cache
        if cache_key in self._analysis_cache:
            cached = self._analysis_cache[cache_key]
            cached_time = datetime.fromisoformat(cached.last_updated)
            if datetime.now() - cached_time < timedelta(hours=24):
                return cached

        # Get transactions
        transactions = await self.get_transactions(
            postal_code=postal_code,
            property_type=property_type,
            months_back=24,
            limit=200
        )

        if not transactions:
            return None

        # Calculate statistics
        prices = sorted([t.price_per_sqm for t in transactions if t.price_per_sqm])
        n = len(prices)

        if n == 0:
            return None

        # Determine confidence
        if n >= 30:
            confidence = "high"
        elif n >= 10:
            confidence = "medium"
        else:
            confidence = "low"

        analysis = MarketAnalysis(
            median_price_per_sqm=prices[n // 2],
            avg_price_per_sqm=sum(prices) / n,
            min_price_per_sqm=prices[0],
            max_price_per_sqm=prices[-1],
            transaction_count=n,
            period_months=24,
            confidence=confidence,
            last_updated=datetime.now().isoformat(),
        )

        self._analysis_cache[cache_key] = analysis
        return analysis

    def calculate_discount(
        self,
        starting_price: float,
        market_analysis: MarketAnalysis,
        surface: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        """Calculate discount percentage compared to market."""
        if not surface or surface <= 0:
            return None

        auction_price_per_sqm = starting_price / surface
        market_price_per_sqm = market_analysis.median_price_per_sqm

        # Calculate discount
        discount_percent = ((market_price_per_sqm - auction_price_per_sqm) / market_price_per_sqm) * 100
        estimated_market_value = market_price_per_sqm * surface
        potential_profit = estimated_market_value - starting_price

        return {
            "auction_price_per_sqm": round(auction_price_per_sqm, 2),
            "market_price_per_sqm": round(market_price_per_sqm, 2),
            "discount_percent": round(discount_percent, 1),
            "estimated_market_value": round(estimated_market_value, 0),
            "potential_profit": round(potential_profit, 0),
            "confidence": market_analysis.confidence,
            "based_on_transactions": market_analysis.transaction_count,
        }


# Singleton instance
_dvf_service: Optional[DVFEnrichmentService] = None


def get_dvf_service() -> DVFEnrichmentService:
    """Get or create the DVF service singleton."""
    global _dvf_service
    if _dvf_service is None:
        _dvf_service = DVFEnrichmentService()
    return _dvf_service


async def enrich_property_with_dvf(
    postal_code: str,
    starting_price: float,
    surface: Optional[float] = None,
    property_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Convenience function to enrich a property with DVF data."""
    service = get_dvf_service()

    market = await service.get_market_price(
        postal_code=postal_code,
        property_type=property_type,
        surface=surface,
    )

    if not market:
        return None

    result = {
        "market_analysis": {
            "median_price_per_sqm": market.median_price_per_sqm,
            "avg_price_per_sqm": market.avg_price_per_sqm,
            "transaction_count": market.transaction_count,
            "confidence": market.confidence,
        }
    }

    if surface:
        discount = service.calculate_discount(starting_price, market, surface)
        if discount:
            result["discount_analysis"] = discount

    return result
