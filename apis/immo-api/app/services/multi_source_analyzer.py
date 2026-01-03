"""
Multi-source market price analyzer
Combines DVF, commune indicators, and online listings for robust price estimates

Sources:
1. DVF (Demandes de Valeurs Foncières) - Official transaction data
2. Commune indicators from data.gouv.fr - Aggregated statistics
3. Online listings - Current asking prices (LeBonCoin, PAP, Bien'ici)
"""
import json
import re
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from pathlib import Path
from enum import Enum

# Import the sync listings scraper
from .listings_scraper import get_listings_scraper


# Data directories
DATA_DIR = Path("/Users/ade/projects/web/immo-marseille/data")
DVF_DIR = DATA_DIR / "dvf"
COMMUNE_FILE = DATA_DIR / "commune_indicators.json"
LISTINGS_CACHE_FILE = DATA_DIR / "listings_cache.json"


class SourceType(Enum):
    DVF = "dvf"
    COMMUNE = "commune"
    LISTINGS = "listings"


class ReliabilityLevel(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient"


@dataclass
class PriceEstimate:
    """Single source price estimate"""
    source_type: SourceType
    source_name: str
    prix_m2: float
    nb_data_points: int
    confidence: float  # 0-100
    notes: str
    comparables: List[Dict] = field(default_factory=list)
    source_url: Optional[str] = None


@dataclass
class MultiSourceAnalysis:
    """Complete multi-source analysis result"""
    postal_code: str
    city: str
    property_type: str
    surface: Optional[float]
    starting_price: Optional[float]

    # Individual source estimates
    dvf_estimate: Optional[PriceEstimate] = None
    commune_estimate: Optional[PriceEstimate] = None
    listings_estimate: Optional[PriceEstimate] = None
    meilleursagents_estimate: Optional[PriceEstimate] = None

    # Tension locative
    tension_locative: Optional[Dict] = None

    # Combined analysis
    prix_m2_recommended: Optional[float] = None
    prix_total_estimated: Optional[float] = None
    discount_percent: Optional[float] = None
    potential_gain: Optional[float] = None

    # Price range
    prix_m2_min: Optional[float] = None
    prix_m2_max: Optional[float] = None

    # Reliability
    reliability: ReliabilityLevel = ReliabilityLevel.INSUFFICIENT
    sources_agreement: float = 0.0  # 0-100

    # Metadata
    analysis_notes: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    analyzed_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "postal_code": self.postal_code,
            "city": self.city,
            "property_type": self.property_type,
            "surface": self.surface,
            "starting_price": self.starting_price,
            "sources": {
                "dvf": self._estimate_to_dict(self.dvf_estimate) if self.dvf_estimate else None,
                "commune": self._estimate_to_dict(self.commune_estimate) if self.commune_estimate else None,
                "listings": self._estimate_to_dict(self.listings_estimate) if self.listings_estimate else None,
                "meilleursagents": self._estimate_to_dict(self.meilleursagents_estimate) if self.meilleursagents_estimate else None,
            },
            "tension_locative": self.tension_locative,
            "combined": {
                "prix_m2_recommended": self.prix_m2_recommended,
                "prix_total_estimated": self.prix_total_estimated,
                "discount_percent": self.discount_percent,
                "potential_gain": self.potential_gain,
                "prix_m2_min": self.prix_m2_min,
                "prix_m2_max": self.prix_m2_max,
            },
            "reliability": self.reliability.value,
            "sources_agreement": self.sources_agreement,
            "analysis_notes": self.analysis_notes,
            "warnings": self.warnings,
            "analyzed_at": self.analyzed_at,
        }

    def _estimate_to_dict(self, est: PriceEstimate) -> Dict:
        return {
            "source_name": est.source_name,
            "prix_m2": est.prix_m2,
            "nb_data_points": est.nb_data_points,
            "confidence": est.confidence,
            "notes": est.notes,
            "comparables": est.comparables[:35],  # Show up to 35 listings
            "source_url": est.source_url,
        }


class MultiSourceAnalyzer:
    """
    Analyzes property prices using multiple data sources
    """

    def __init__(self):
        self._dvf_cache: Dict[str, List[Dict]] = {}
        self._commune_data: Dict = {}
        self._listings_cache: Dict = {}
        self._load_commune_data()
        self._load_listings_cache()

    def _load_commune_data(self):
        """Load commune indicators from cache"""
        if COMMUNE_FILE.exists():
            try:
                with open(COMMUNE_FILE, 'r', encoding='utf-8') as f:
                    self._commune_data = json.load(f)
                print(f"[MultiSource] Loaded {len(self._commune_data)} communes")
            except Exception as e:
                print(f"[MultiSource] Failed to load commune data: {e}")

    def _load_listings_cache(self):
        """Load listings cache"""
        if LISTINGS_CACHE_FILE.exists():
            try:
                with open(LISTINGS_CACHE_FILE, 'r', encoding='utf-8') as f:
                    self._listings_cache = json.load(f)
                print(f"[MultiSource] Loaded {len(self._listings_cache)} cached listings searches")
            except Exception as e:
                print(f"[MultiSource] Failed to load listings cache: {e}")

    def _save_listings_cache(self):
        """Save listings cache"""
        try:
            with open(LISTINGS_CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(self._listings_cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[MultiSource] Failed to save listings cache: {e}")

    async def analyze(
        self,
        postal_code: str,
        city: str,
        property_type: str,
        surface: Optional[float] = None,
        starting_price: Optional[float] = None,
    ) -> MultiSourceAnalysis:
        """
        Perform comprehensive multi-source price analysis
        """
        analysis = MultiSourceAnalysis(
            postal_code=postal_code,
            city=city,
            property_type=property_type,
            surface=surface,
            starting_price=starting_price,
        )

        print(f"[MultiSource] Analyzing {city} ({postal_code}), {property_type}, {surface}m²")

        # 1. DVF Analysis
        dvf_estimate = await self._get_dvf_estimate(postal_code, property_type, surface)
        if dvf_estimate:
            analysis.dvf_estimate = dvf_estimate
            analysis.analysis_notes.append(
                f"DVF: {dvf_estimate.prix_m2:,.0f} €/m² ({dvf_estimate.nb_data_points} transactions)"
            )

        # 2. Commune Indicators
        commune_estimate = self._get_commune_estimate(postal_code, property_type)
        if commune_estimate:
            analysis.commune_estimate = commune_estimate
            analysis.analysis_notes.append(
                f"Commune: {commune_estimate.prix_m2:,.0f} €/m² (moyenne {commune_estimate.notes})"
            )

        # 3. Online Listings (includes MeilleursAgents and tension locative)
        listings_result = await self._get_listings_estimate(postal_code, city, property_type, surface)
        if listings_result:
            listings_estimate, ma_estimate, tension = listings_result
            if listings_estimate:
                analysis.listings_estimate = listings_estimate
                analysis.analysis_notes.append(
                    f"Annonces: {listings_estimate.prix_m2:,.0f} €/m² ({listings_estimate.nb_data_points} annonces)"
                )
            if ma_estimate:
                analysis.meilleursagents_estimate = ma_estimate
                analysis.analysis_notes.append(
                    f"MeilleursAgents: {ma_estimate.prix_m2:,.0f} €/m²"
                )
            if tension:
                analysis.tension_locative = tension
                if tension.get('niveau', 0) >= 2:
                    analysis.analysis_notes.append(f"Zone tendue: {tension.get('label', '')}")

        # Generate combined recommendation
        self._generate_recommendation(analysis)

        return analysis

    async def _get_dvf_estimate(
        self,
        postal_code: str,
        property_type: str,
        surface: Optional[float]
    ) -> Optional[PriceEstimate]:
        """Get DVF-based price estimate"""
        dept = postal_code[:2]

        # Load DVF data for department
        if dept not in self._dvf_cache:
            self._dvf_cache[dept] = self._load_dvf_data(dept)

        all_transactions = self._dvf_cache.get(dept, [])

        # Filter by postal code and property type
        date_limit = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")  # 2 years

        type_mapping = {
            "apartment": "Appartement",
            "appartement": "Appartement",
            "house": "Maison",
            "maison": "Maison",
        }
        dvf_type = type_mapping.get(property_type.lower(), None)

        filtered = []
        for tx in all_transactions:
            if tx.get("postal_code") != postal_code:
                continue
            if tx.get("date", "") < date_limit:
                continue
            if dvf_type and dvf_type.lower() not in tx.get("property_type", "").lower():
                continue
            if tx.get("price_per_sqm") and tx["price_per_sqm"] > 0:
                filtered.append(tx)

        if len(filtered) < 3:
            return None

        # Calculate statistics
        prices = sorted([tx["price_per_sqm"] for tx in filtered])
        n = len(prices)
        median = prices[n // 2]

        # Confidence based on data quantity
        confidence = min(100, 30 + n * 2)

        # Find comparable transactions (similar surface if specified)
        comparables = []
        if surface:
            similar = [tx for tx in filtered
                      if tx.get("surface") and abs(tx["surface"] - surface) / surface < 0.3]
            similar.sort(key=lambda x: abs(x["surface"] - surface))
            comparables = similar[:10]
        else:
            filtered.sort(key=lambda x: x.get("date", ""), reverse=True)
            comparables = filtered[:10]

        return PriceEstimate(
            source_type=SourceType.DVF,
            source_name="DVF (Transactions officielles)",
            prix_m2=round(median, 0),
            nb_data_points=n,
            confidence=confidence,
            notes=f"{n} transactions sur 24 mois",
            comparables=[{
                "date": c.get("date"),
                "price": c.get("price"),
                "surface": c.get("surface"),
                "price_per_sqm": round(c.get("price_per_sqm", 0), 0),
                "address": c.get("address"),
                "property_type": c.get("property_type"),
            } for c in comparables],
            source_url="https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres/",
        )

    def _load_dvf_data(self, department: str) -> List[Dict]:
        """Load DVF data from CSV files for a department"""
        import csv

        transactions = []

        for year in [2022, 2023, 2024]:
            file_path = DVF_DIR / f"dvf_{department}_{year}.csv"
            if not file_path.exists():
                continue

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        try:
                            price_str = row.get("valeur_fonciere", "").replace(",", ".")
                            if not price_str:
                                continue
                            price = float(price_str)
                            if price <= 0:
                                continue

                            surface_str = row.get("surface_reelle_bati", "").replace(",", ".")
                            surface = float(surface_str) if surface_str else None

                            if not surface or surface <= 0:
                                continue

                            price_per_sqm = price / surface
                            if price_per_sqm < 500 or price_per_sqm > 20000:
                                continue

                            numero = row.get("adresse_numero", "") or row.get("no_voie", "")
                            voie = row.get("adresse_nom_voie", "") or row.get("voie", "")
                            address = f"{numero} {voie}".strip()

                            transactions.append({
                                "date": row.get("date_mutation", ""),
                                "price": price,
                                "surface": surface,
                                "price_per_sqm": price_per_sqm,
                                "property_type": row.get("type_local", ""),
                                "postal_code": row.get("code_postal", ""),
                                "commune": row.get("nom_commune", ""),
                                "address": address,
                                "rooms": row.get("nombre_pieces_principales", ""),
                            })
                        except:
                            continue
            except Exception as e:
                print(f"[DVF] Error loading {file_path}: {e}")

        print(f"[DVF] Loaded {len(transactions)} transactions for dept {department}")
        return transactions

    def _get_commune_estimate(
        self,
        postal_code: str,
        property_type: str
    ) -> Optional[PriceEstimate]:
        """Get commune-based price estimate"""
        if not self._commune_data:
            return None

        # Try exact postal code match
        commune_data = self._commune_data.get(postal_code)

        if not commune_data:
            # Try department-level search
            dept = postal_code[:2]
            for key, data in self._commune_data.items():
                if data.get("department") == dept:
                    commune_data = data
                    break

        if not commune_data:
            return None

        years = commune_data.get("years", {})
        if not years:
            return None

        # Get most recent year
        sorted_years = sorted(years.keys(), reverse=True)
        latest_year = sorted_years[0]
        latest_data = years[latest_year]

        prix_m2 = latest_data.get("prix_m2")
        if not prix_m2:
            return None

        nb_mutations = latest_data.get("nb_mutations", 0) or 0

        # Confidence based on data volume
        confidence = min(80, 20 + nb_mutations / 10)

        # Build comparables (historical data)
        comparables = []
        for year, data in sorted(years.items(), reverse=True)[:5]:
            if data.get("prix_m2"):
                comparables.append({
                    "year": year,
                    "prix_m2": round(data["prix_m2"], 0),
                    "nb_mutations": data.get("nb_mutations"),
                    "surface_moy": data.get("surface_moy"),
                })

        return PriceEstimate(
            source_type=SourceType.COMMUNE,
            source_name="Indicateurs Commune (data.gouv.fr)",
            prix_m2=round(prix_m2, 0),
            nb_data_points=nb_mutations,
            confidence=confidence,
            notes=f"année {latest_year}",
            comparables=comparables,
            source_url="https://www.data.gouv.fr/fr/datasets/indicateurs-immobiliers-par-commune/",
        )

    async def _get_listings_estimate(
        self,
        postal_code: str,
        city: str,
        property_type: str,
        surface: Optional[float]
    ) -> Optional[tuple]:
        """Get estimate from online listings using async scraper
        Returns: (listings_estimate, meilleursagents_estimate, tension_locative)
        """
        # Use the async listings scraper (Playwright for LeBonCoin)
        scraper = get_listings_scraper()

        # Call async method (has its own caching)
        result = await scraper.get_similar_listings(postal_code, city, property_type, surface)

        listings_estimate = None
        ma_estimate = None
        tension = result.get("tension_locative")

        if result.get("prix_m2"):
            # Convert comparables format - include all listings (up to 35)
            comparables = []
            for listing in result.get("listings", [])[:35]:
                comparables.append({
                    "title": listing.get("titre", "")[:50],
                    "price": listing.get("prix"),
                    "surface": listing.get("surface"),
                    "price_per_sqm": listing.get("prix_m2"),
                    "url": listing.get("url", ""),
                    "source": listing.get("source", ""),
                })

            nb_listings = result.get("nb_listings", len(comparables))
            confidence = min(70, 30 + nb_listings * 2)

            listings_estimate = PriceEstimate(
                source_type=SourceType.LISTINGS,
                source_name="Annonces en ligne",
                prix_m2=result["prix_m2"],
                nb_data_points=nb_listings,
                confidence=confidence,
                notes=result.get("notes", f"{nb_listings} annonces"),
                comparables=comparables,
                source_url=result.get("source_url", f"https://www.leboncoin.fr/recherche?category=9&locations={postal_code}"),
            )

        # MeilleursAgents estimate
        ma_data = result.get("meilleursagents")
        if ma_data and ma_data.get("prix_m2"):
            ma_estimate = PriceEstimate(
                source_type=SourceType.LISTINGS,
                source_name="MeilleursAgents",
                prix_m2=ma_data["prix_m2"],
                nb_data_points=1,
                confidence=60,  # Aggregated estimate
                notes="Estimation MeilleursAgents",
                comparables=[],
                source_url=ma_data.get("url", f"https://www.meilleursagents.com/prix-immobilier/{postal_code}/"),
            )
            # Add rental info if available
            if ma_data.get("loyer_m2"):
                ma_estimate.notes += f" - Loyer: {ma_data['loyer_m2']} €/m²"

        return (listings_estimate, ma_estimate, tension)

    def _generate_recommendation(self, analysis: MultiSourceAnalysis):
        """Generate combined recommendation from all sources"""
        estimates = []
        weights = []

        if analysis.dvf_estimate:
            estimates.append(analysis.dvf_estimate.prix_m2)
            weights.append(analysis.dvf_estimate.confidence)

        if analysis.commune_estimate:
            estimates.append(analysis.commune_estimate.prix_m2)
            weights.append(analysis.commune_estimate.confidence * 0.8)  # Lower weight for aggregated data

        if analysis.listings_estimate:
            estimates.append(analysis.listings_estimate.prix_m2)
            weights.append(analysis.listings_estimate.confidence * 0.9)

        if analysis.meilleursagents_estimate:
            estimates.append(analysis.meilleursagents_estimate.prix_m2)
            weights.append(analysis.meilleursagents_estimate.confidence * 0.85)  # Good but aggregated

        if not estimates:
            analysis.warnings.append("Aucune source de données disponible")
            return

        # Weighted average
        total_weight = sum(weights)
        weighted_avg = sum(e * w for e, w in zip(estimates, weights)) / total_weight

        analysis.prix_m2_recommended = round(weighted_avg, 0)
        analysis.prix_m2_min = round(min(estimates), 0)
        analysis.prix_m2_max = round(max(estimates), 0)

        if analysis.surface:
            analysis.prix_total_estimated = round(weighted_avg * analysis.surface, 0)

            if analysis.starting_price:
                market_value = weighted_avg * analysis.surface
                analysis.discount_percent = round(
                    ((market_value - analysis.starting_price) / market_value) * 100, 1
                )
                analysis.potential_gain = round(market_value - analysis.starting_price, 0)

        # Calculate sources agreement
        if len(estimates) >= 2:
            avg = sum(estimates) / len(estimates)
            max_deviation = max(abs(e - avg) / avg for e in estimates)
            analysis.sources_agreement = round((1 - max_deviation) * 100, 0)
        else:
            analysis.sources_agreement = 50

        # Determine reliability
        n_sources = len(estimates)
        avg_confidence = total_weight / n_sources

        if n_sources >= 3 and avg_confidence >= 70 and analysis.sources_agreement >= 70:
            analysis.reliability = ReliabilityLevel.HIGH
        elif n_sources >= 2 and avg_confidence >= 50:
            analysis.reliability = ReliabilityLevel.MEDIUM
        elif n_sources >= 1:
            analysis.reliability = ReliabilityLevel.LOW
        else:
            analysis.reliability = ReliabilityLevel.INSUFFICIENT

        # Add warnings
        if analysis.sources_agreement < 50:
            analysis.warnings.append(
                f"Désaccord entre sources ({analysis.sources_agreement}%) - "
                f"fourchette: {analysis.prix_m2_min:,.0f} - {analysis.prix_m2_max:,.0f} €/m²"
            )


# Singleton instance
_analyzer: Optional[MultiSourceAnalyzer] = None


def get_analyzer() -> MultiSourceAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = MultiSourceAnalyzer()
    return _analyzer
