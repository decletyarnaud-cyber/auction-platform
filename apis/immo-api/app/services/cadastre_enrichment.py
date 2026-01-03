"""
Cadastre Data Enrichment Service

This service fetches parcel information from the French Cadastre API
to provide detailed land/property information.

API: https://cadastre.data.gouv.fr/api
"""

import httpx
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime
import asyncio


@dataclass
class ParcelInfo:
    """Represents cadastral parcel information."""
    parcel_id: str
    section: str
    numero: str
    commune_code: str
    commune_name: str
    surface_parcelle: Optional[float]  # m²
    contenance: Optional[float]  # m² from cadastre
    nature: Optional[str]  # Type of land
    prefixe: Optional[str]
    geometry: Optional[Dict]  # GeoJSON geometry


@dataclass
class BuildingInfo:
    """Represents building information from cadastre."""
    building_id: str
    parcel_id: str
    surface_bati: Optional[float]  # Built surface m²
    nb_locaux: Optional[int]  # Number of premises
    type_local: Optional[str]
    annee_construction: Optional[int]


@dataclass
class CadastreAnalysis:
    """Complete cadastre analysis for a property."""
    parcel: Optional[ParcelInfo]
    buildings: List[BuildingInfo]
    total_parcel_surface: float
    total_built_surface: float
    built_ratio: Optional[float]  # Built surface / parcel surface
    nearby_parcels_count: int
    zone_type: Optional[str]  # Residential, commercial, agricultural
    last_updated: str


class CadastreEnrichmentService:
    """Service to enrich property data with Cadastre information."""

    BASE_URL = "https://cadastre.data.gouv.fr/bundler/cadastre-etalab"
    GEOCODER_URL = "https://api-adresse.data.gouv.fr"

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self._cache: Dict[str, CadastreAnalysis] = {}

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    async def get_parcel_by_coordinates(
        self,
        latitude: float,
        longitude: float,
    ) -> Optional[ParcelInfo]:
        """
        Get parcel information from coordinates.

        Args:
            latitude: GPS latitude
            longitude: GPS longitude

        Returns:
            ParcelInfo or None
        """
        try:
            # Use the cadastre API to find parcel at coordinates
            url = f"https://apicarto.ign.fr/api/cadastre/parcelle"
            params = {
                "geom": f'{{"type":"Point","coordinates":[{longitude},{latitude}]}}',
            }

            response = await self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("features"):
                return None

            feature = data["features"][0]
            props = feature.get("properties", {})

            return ParcelInfo(
                parcel_id=props.get("id", ""),
                section=props.get("section", ""),
                numero=props.get("numero", ""),
                commune_code=props.get("commune", ""),
                commune_name=props.get("nom_commune", ""),
                surface_parcelle=props.get("contenance"),
                contenance=props.get("contenance"),
                nature=props.get("nature"),
                prefixe=props.get("prefixe"),
                geometry=feature.get("geometry"),
            )

        except httpx.HTTPError as e:
            print(f"Cadastre API error: {e}")
            return None
        except Exception as e:
            print(f"Cadastre processing error: {e}")
            return None

    async def get_parcel_by_address(
        self,
        address: str,
        postal_code: str,
        city: str,
    ) -> Optional[ParcelInfo]:
        """
        Get parcel information from address using geocoding.

        Args:
            address: Street address
            postal_code: Postal code
            city: City name

        Returns:
            ParcelInfo or None
        """
        try:
            # First, geocode the address
            search_query = f"{address} {postal_code} {city}"
            geocode_url = f"{self.GEOCODER_URL}/search/"
            params = {
                "q": search_query,
                "limit": 1,
                "postcode": postal_code,
            }

            response = await self.client.get(geocode_url, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("features"):
                return None

            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            longitude, latitude = coords[0], coords[1]

            # Now get parcel from coordinates
            return await self.get_parcel_by_coordinates(latitude, longitude)

        except Exception as e:
            print(f"Geocoding/Cadastre error: {e}")
            return None

    async def get_buildings_on_parcel(
        self,
        parcel_id: str,
        commune_code: str,
    ) -> List[BuildingInfo]:
        """
        Get buildings information on a parcel.

        Args:
            parcel_id: Cadastre parcel ID
            commune_code: INSEE commune code

        Returns:
            List of BuildingInfo
        """
        try:
            # Query buildings API
            url = f"https://apicarto.ign.fr/api/cadastre/batiment"
            params = {
                "code_insee": commune_code,
            }

            response = await self.client.get(url, params=params)

            if response.status_code != 200:
                return []

            data = response.json()
            buildings = []

            for feature in data.get("features", []):
                props = feature.get("properties", {})
                buildings.append(BuildingInfo(
                    building_id=props.get("id", ""),
                    parcel_id=parcel_id,
                    surface_bati=props.get("surface"),
                    nb_locaux=props.get("nb_locaux"),
                    type_local=props.get("type"),
                    annee_construction=props.get("annee_construction"),
                ))

            return buildings

        except Exception as e:
            print(f"Buildings API error: {e}")
            return []

    async def get_cadastre_analysis(
        self,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        address: Optional[str] = None,
        postal_code: Optional[str] = None,
        city: Optional[str] = None,
    ) -> Optional[CadastreAnalysis]:
        """
        Get complete cadastre analysis for a property.

        Args:
            latitude: GPS latitude (optional if address provided)
            longitude: GPS longitude (optional if address provided)
            address: Street address (optional if coordinates provided)
            postal_code: Postal code
            city: City name

        Returns:
            CadastreAnalysis or None
        """
        # Get parcel info
        parcel = None

        if latitude and longitude:
            parcel = await self.get_parcel_by_coordinates(latitude, longitude)
        elif address and postal_code and city:
            parcel = await self.get_parcel_by_address(address, postal_code, city)

        if not parcel:
            return None

        # Get buildings
        buildings = await self.get_buildings_on_parcel(
            parcel.parcel_id,
            parcel.commune_code,
        )

        # Calculate totals
        total_parcel = parcel.surface_parcelle or 0
        total_built = sum(b.surface_bati or 0 for b in buildings)

        # Calculate built ratio
        built_ratio = None
        if total_parcel > 0:
            built_ratio = total_built / total_parcel

        # Determine zone type based on nature
        zone_type = None
        if parcel.nature:
            nature_lower = parcel.nature.lower()
            if any(x in nature_lower for x in ["habitation", "maison", "appartement"]):
                zone_type = "residential"
            elif any(x in nature_lower for x in ["commercial", "industriel", "bureau"]):
                zone_type = "commercial"
            elif any(x in nature_lower for x in ["agricole", "culture", "pré", "bois"]):
                zone_type = "agricultural"
            else:
                zone_type = "other"

        return CadastreAnalysis(
            parcel=parcel,
            buildings=buildings,
            total_parcel_surface=total_parcel,
            total_built_surface=total_built,
            built_ratio=built_ratio,
            nearby_parcels_count=0,  # Would need additional API call
            zone_type=zone_type,
            last_updated=datetime.now().isoformat(),
        )


# Singleton instance
_cadastre_service: Optional[CadastreEnrichmentService] = None


def get_cadastre_service() -> CadastreEnrichmentService:
    """Get or create the Cadastre service singleton."""
    global _cadastre_service
    if _cadastre_service is None:
        _cadastre_service = CadastreEnrichmentService()
    return _cadastre_service


async def enrich_property_with_cadastre(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    address: Optional[str] = None,
    postal_code: Optional[str] = None,
    city: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to enrich a property with Cadastre data.

    Returns:
        Enrichment data dict or None
    """
    service = get_cadastre_service()

    analysis = await service.get_cadastre_analysis(
        latitude=latitude,
        longitude=longitude,
        address=address,
        postal_code=postal_code,
        city=city,
    )

    if not analysis:
        return None

    result = {
        "parcel": None,
        "buildings_count": len(analysis.buildings),
        "total_parcel_surface": analysis.total_parcel_surface,
        "total_built_surface": analysis.total_built_surface,
        "built_ratio": analysis.built_ratio,
        "zone_type": analysis.zone_type,
    }

    if analysis.parcel:
        result["parcel"] = {
            "id": analysis.parcel.parcel_id,
            "section": analysis.parcel.section,
            "numero": analysis.parcel.numero,
            "commune": analysis.parcel.commune_name,
            "surface": analysis.parcel.surface_parcelle,
        }

    return result
