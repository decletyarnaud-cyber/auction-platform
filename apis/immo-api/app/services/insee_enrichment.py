"""
INSEE Socio-Economic Enrichment Service

This service fetches socio-economic indicators from INSEE (French National Institute
of Statistics) to provide context about neighborhoods and municipalities.

API: https://api.insee.fr
Alternative: https://geo.api.gouv.fr (for geographic data)
"""

import httpx
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime
import asyncio


@dataclass
class PopulationData:
    """Population statistics for a commune."""
    total: int
    density: float  # inhabitants per km²
    variation_5y: Optional[float]  # % change over 5 years
    median_age: Optional[float]
    youth_ratio: Optional[float]  # % under 25
    senior_ratio: Optional[float]  # % over 65


@dataclass
class IncomeData:
    """Income statistics for a commune."""
    median_income: Optional[float]  # € per year per fiscal unit
    poverty_rate: Optional[float]  # % below poverty line
    unemployment_rate: Optional[float]  # %
    average_income: Optional[float]


@dataclass
class HousingData:
    """Housing statistics for a commune."""
    total_housing: int
    primary_residences: int
    secondary_residences: int
    vacant_housing: int
    vacancy_rate: float  # %
    owner_occupied_rate: float  # %
    average_rooms: Optional[float]
    housing_constructed_before_1945: Optional[float]  # %


@dataclass
class CommuneInfo:
    """Basic commune information."""
    code_insee: str
    name: str
    postal_codes: List[str]
    department: str
    region: str
    surface: float  # km²
    latitude: Optional[float]
    longitude: Optional[float]


@dataclass
class SocioEconomicAnalysis:
    """Complete socio-economic analysis for a location."""
    commune: CommuneInfo
    population: Optional[PopulationData]
    income: Optional[IncomeData]
    housing: Optional[HousingData]
    quality_score: Optional[float]  # 0-100 composite score
    investment_attractiveness: str  # "low", "medium", "high", "very_high"
    last_updated: str


class INSEEEnrichmentService:
    """Service to enrich property data with INSEE socio-economic indicators."""

    GEO_API_URL = "https://geo.api.gouv.fr"
    INSEE_LOCAL_URL = "https://api.insee.fr/donnees-locales/V0.1"

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self._cache: Dict[str, SocioEconomicAnalysis] = {}
        # Static data for demo - would need INSEE API key for real data
        self._commune_stats = self._load_commune_stats()

    def _load_commune_stats(self) -> Dict[str, Dict]:
        """Load pre-computed commune statistics (demo data)."""
        # In production, this would fetch from INSEE API with proper authentication
        # For now, return sample data for major cities
        return {
            "13055": {  # Marseille
                "median_income": 21500,
                "unemployment_rate": 14.2,
                "poverty_rate": 26.1,
                "vacancy_rate": 8.2,
                "owner_occupied_rate": 41.5,
                "population_density": 3562,
                "median_age": 37.2,
            },
            "13001": {  # Aix-en-Provence
                "median_income": 27800,
                "unemployment_rate": 9.1,
                "poverty_rate": 12.3,
                "vacancy_rate": 6.8,
                "owner_occupied_rate": 48.2,
                "population_density": 425,
                "median_age": 38.5,
            },
            "75056": {  # Paris
                "median_income": 31200,
                "unemployment_rate": 8.5,
                "poverty_rate": 15.8,
                "vacancy_rate": 7.5,
                "owner_occupied_rate": 33.2,
                "population_density": 20755,
                "median_age": 36.8,
            },
            "83137": {  # Toulon
                "median_income": 22100,
                "unemployment_rate": 12.8,
                "poverty_rate": 19.5,
                "vacancy_rate": 7.8,
                "owner_occupied_rate": 45.3,
                "population_density": 4157,
                "median_age": 40.1,
            },
        }

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    async def get_commune_info(
        self,
        postal_code: Optional[str] = None,
        insee_code: Optional[str] = None,
        city_name: Optional[str] = None,
    ) -> Optional[CommuneInfo]:
        """
        Get basic commune information.

        Args:
            postal_code: French postal code
            insee_code: INSEE commune code
            city_name: City name

        Returns:
            CommuneInfo or None
        """
        try:
            # Build query based on available info
            if insee_code:
                url = f"{self.GEO_API_URL}/communes/{insee_code}"
                params = {}
            elif postal_code:
                url = f"{self.GEO_API_URL}/communes"
                params = {"codePostal": postal_code}
            elif city_name:
                url = f"{self.GEO_API_URL}/communes"
                params = {"nom": city_name, "boost": "population", "limit": 1}
            else:
                return None

            params["fields"] = "nom,code,codesPostaux,surface,centre,departement,region"

            response = await self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            # Handle list response vs single
            if isinstance(data, list):
                if not data:
                    return None
                data = data[0]

            center = data.get("centre", {}).get("coordinates", [None, None])

            return CommuneInfo(
                code_insee=data.get("code", ""),
                name=data.get("nom", ""),
                postal_codes=data.get("codesPostaux", []),
                department=data.get("departement", {}).get("code", ""),
                region=data.get("region", {}).get("nom", ""),
                surface=data.get("surface", 0) / 100,  # Convert hectares to km²
                latitude=center[1] if len(center) > 1 else None,
                longitude=center[0] if len(center) > 0 else None,
            )

        except httpx.HTTPError as e:
            print(f"Geo API error: {e}")
            return None
        except Exception as e:
            print(f"Commune info error: {e}")
            return None

    async def get_population_data(
        self,
        insee_code: str,
    ) -> Optional[PopulationData]:
        """
        Get population statistics for a commune.

        Args:
            insee_code: INSEE commune code

        Returns:
            PopulationData or None
        """
        try:
            url = f"{self.GEO_API_URL}/communes/{insee_code}"
            params = {"fields": "population"}

            response = await self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            population = data.get("population", 0)

            # Get additional stats from cache
            stats = self._commune_stats.get(insee_code, {})

            return PopulationData(
                total=population,
                density=stats.get("population_density", 0),
                variation_5y=None,  # Would need historical data
                median_age=stats.get("median_age"),
                youth_ratio=None,
                senior_ratio=None,
            )

        except Exception as e:
            print(f"Population data error: {e}")
            return None

    async def get_income_data(
        self,
        insee_code: str,
    ) -> Optional[IncomeData]:
        """
        Get income statistics for a commune.

        Args:
            insee_code: INSEE commune code

        Returns:
            IncomeData or None
        """
        # Get from pre-loaded stats (would use INSEE API in production)
        stats = self._commune_stats.get(insee_code)

        if not stats:
            # Return regional average for unknown communes
            return IncomeData(
                median_income=23000,
                poverty_rate=15.0,
                unemployment_rate=10.0,
                average_income=None,
            )

        return IncomeData(
            median_income=stats.get("median_income"),
            poverty_rate=stats.get("poverty_rate"),
            unemployment_rate=stats.get("unemployment_rate"),
            average_income=None,
        )

    async def get_housing_data(
        self,
        insee_code: str,
    ) -> Optional[HousingData]:
        """
        Get housing statistics for a commune.

        Args:
            insee_code: INSEE commune code

        Returns:
            HousingData or None
        """
        stats = self._commune_stats.get(insee_code)

        if not stats:
            return None

        return HousingData(
            total_housing=0,  # Would need INSEE data
            primary_residences=0,
            secondary_residences=0,
            vacant_housing=0,
            vacancy_rate=stats.get("vacancy_rate", 7.0),
            owner_occupied_rate=stats.get("owner_occupied_rate", 50.0),
            average_rooms=None,
            housing_constructed_before_1945=None,
        )

    def _calculate_quality_score(
        self,
        income: Optional[IncomeData],
        housing: Optional[HousingData],
        population: Optional[PopulationData],
    ) -> float:
        """Calculate composite quality score (0-100)."""
        score = 50.0  # Base score

        if income:
            # Income component (max ±25 points)
            if income.median_income:
                # National median is ~23000€
                income_factor = min(income.median_income / 30000, 1.5)
                score += (income_factor - 1) * 25

            # Unemployment penalty
            if income.unemployment_rate:
                if income.unemployment_rate > 15:
                    score -= 10
                elif income.unemployment_rate > 10:
                    score -= 5

        if housing:
            # Low vacancy is good
            if housing.vacancy_rate < 5:
                score += 10
            elif housing.vacancy_rate > 10:
                score -= 5

        # Ensure score is within bounds
        return max(0, min(100, score))

    def _get_investment_attractiveness(
        self,
        quality_score: float,
        income: Optional[IncomeData],
    ) -> str:
        """Determine investment attractiveness level."""
        if quality_score >= 70:
            return "very_high"
        elif quality_score >= 55:
            return "high"
        elif quality_score >= 40:
            return "medium"
        return "low"

    async def get_socioeconomic_analysis(
        self,
        postal_code: Optional[str] = None,
        insee_code: Optional[str] = None,
        city_name: Optional[str] = None,
    ) -> Optional[SocioEconomicAnalysis]:
        """
        Get complete socio-economic analysis for a location.

        Args:
            postal_code: French postal code
            insee_code: INSEE commune code
            city_name: City name

        Returns:
            SocioEconomicAnalysis or None
        """
        # Check cache
        cache_key = insee_code or postal_code or city_name
        if cache_key and cache_key in self._cache:
            return self._cache[cache_key]

        # Get commune info first
        commune = await self.get_commune_info(
            postal_code=postal_code,
            insee_code=insee_code,
            city_name=city_name,
        )

        if not commune:
            return None

        # Fetch all data in parallel
        population, income, housing = await asyncio.gather(
            self.get_population_data(commune.code_insee),
            self.get_income_data(commune.code_insee),
            self.get_housing_data(commune.code_insee),
        )

        # Calculate scores
        quality_score = self._calculate_quality_score(income, housing, population)
        attractiveness = self._get_investment_attractiveness(quality_score, income)

        analysis = SocioEconomicAnalysis(
            commune=commune,
            population=population,
            income=income,
            housing=housing,
            quality_score=quality_score,
            investment_attractiveness=attractiveness,
            last_updated=datetime.now().isoformat(),
        )

        # Cache result
        if cache_key:
            self._cache[cache_key] = analysis

        return analysis


# Singleton instance
_insee_service: Optional[INSEEEnrichmentService] = None


def get_insee_service() -> INSEEEnrichmentService:
    """Get or create the INSEE service singleton."""
    global _insee_service
    if _insee_service is None:
        _insee_service = INSEEEnrichmentService()
    return _insee_service


async def enrich_property_with_insee(
    postal_code: Optional[str] = None,
    city: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to enrich a property with INSEE data.

    Returns:
        Enrichment data dict or None
    """
    service = get_insee_service()

    analysis = await service.get_socioeconomic_analysis(
        postal_code=postal_code,
        city_name=city,
    )

    if not analysis:
        return None

    result = {
        "commune": {
            "code": analysis.commune.code_insee,
            "name": analysis.commune.name,
            "department": analysis.commune.department,
            "region": analysis.commune.region,
        },
        "quality_score": round(analysis.quality_score, 1) if analysis.quality_score else None,
        "investment_attractiveness": analysis.investment_attractiveness,
    }

    if analysis.population:
        result["population"] = {
            "total": analysis.population.total,
            "density": analysis.population.density,
            "median_age": analysis.population.median_age,
        }

    if analysis.income:
        result["income"] = {
            "median": analysis.income.median_income,
            "unemployment_rate": analysis.income.unemployment_rate,
            "poverty_rate": analysis.income.poverty_rate,
        }

    if analysis.housing:
        result["housing"] = {
            "vacancy_rate": analysis.housing.vacancy_rate,
            "owner_occupied_rate": analysis.housing.owner_occupied_rate,
        }

    return result
