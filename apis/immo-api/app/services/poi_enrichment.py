"""
POI (Points of Interest) & Accessibility Enrichment Service

This service analyzes the accessibility and nearby amenities of a property
using OpenStreetMap data via the Overpass API.

API: https://overpass-api.de/api/interpreter
"""

import httpx
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
import asyncio
import math


@dataclass
class POI:
    """Represents a Point of Interest."""
    id: str
    name: str
    category: str  # transport, education, health, shopping, leisure
    type: str  # specific type (metro, school, hospital, etc.)
    distance: float  # meters from property
    latitude: float
    longitude: float
    address: Optional[str] = None


@dataclass
class TransportAccessibility:
    """Transport accessibility analysis."""
    metro_stations: List[POI]
    bus_stops: List[POI]
    train_stations: List[POI]
    tram_stops: List[POI]
    nearest_transport: Optional[POI]
    transport_score: float  # 0-100


@dataclass
class AmenitiesAnalysis:
    """Nearby amenities analysis."""
    schools: List[POI]
    healthcare: List[POI]  # hospitals, pharmacies, doctors
    shopping: List[POI]  # supermarkets, shops
    leisure: List[POI]  # restaurants, cafes, parks
    services: List[POI]  # banks, post offices


@dataclass
class AccessibilityScore:
    """Overall accessibility scores."""
    transport_score: float  # 0-100
    education_score: float  # 0-100
    health_score: float  # 0-100
    shopping_score: float  # 0-100
    leisure_score: float  # 0-100
    overall_score: float  # 0-100 weighted average
    walkability: str  # "very_high", "high", "medium", "low"


@dataclass
class POIAnalysis:
    """Complete POI analysis for a property."""
    transport: TransportAccessibility
    amenities: AmenitiesAnalysis
    scores: AccessibilityScore
    total_pois_500m: int
    total_pois_1km: int
    last_updated: str


class POIEnrichmentService:
    """Service to analyze Points of Interest around a property."""

    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    # POI categories and their OSM tags
    POI_CATEGORIES = {
        "metro": '[railway="subway_entrance"]',
        "bus_stop": '[highway="bus_stop"]',
        "train_station": '[railway="station"]',
        "tram_stop": '[railway="tram_stop"]',
        "school": '[amenity="school"]',
        "university": '[amenity="university"]',
        "kindergarten": '[amenity="kindergarten"]',
        "hospital": '[amenity="hospital"]',
        "pharmacy": '[amenity="pharmacy"]',
        "doctors": '[amenity="doctors"]',
        "supermarket": '[shop="supermarket"]',
        "bakery": '[shop="bakery"]',
        "restaurant": '[amenity="restaurant"]',
        "cafe": '[amenity="cafe"]',
        "park": '[leisure="park"]',
        "bank": '[amenity="bank"]',
        "post_office": '[amenity="post_office"]',
    }

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)
        self._cache: Dict[str, POIAnalysis] = {}

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    def _haversine_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        """Calculate distance between two points in meters."""
        R = 6371000  # Earth radius in meters

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    async def _query_overpass(
        self,
        latitude: float,
        longitude: float,
        radius: int,
        poi_types: List[str],
    ) -> List[Dict]:
        """Query Overpass API for POIs."""
        try:
            # Build query for multiple POI types
            poi_filters = "".join([
                f"node{self.POI_CATEGORIES[t]}(around:{radius},{latitude},{longitude});"
                for t in poi_types if t in self.POI_CATEGORIES
            ])

            query = f"""
            [out:json][timeout:30];
            (
                {poi_filters}
            );
            out body;
            """

            response = await self.client.post(
                self.OVERPASS_URL,
                data={"data": query},
            )
            response.raise_for_status()
            data = response.json()

            return data.get("elements", [])

        except httpx.HTTPError as e:
            print(f"Overpass API error: {e}")
            return []
        except Exception as e:
            print(f"POI query error: {e}")
            return []

    def _element_to_poi(
        self,
        element: Dict,
        property_lat: float,
        property_lon: float,
        poi_type: str,
        category: str,
    ) -> POI:
        """Convert Overpass element to POI."""
        lat = element.get("lat", 0)
        lon = element.get("lon", 0)
        tags = element.get("tags", {})

        return POI(
            id=str(element.get("id", "")),
            name=tags.get("name", poi_type.replace("_", " ").title()),
            category=category,
            type=poi_type,
            distance=self._haversine_distance(property_lat, property_lon, lat, lon),
            latitude=lat,
            longitude=lon,
            address=tags.get("addr:street"),
        )

    async def get_transport_accessibility(
        self,
        latitude: float,
        longitude: float,
        radius: int = 1000,
    ) -> TransportAccessibility:
        """
        Get transport accessibility analysis.

        Args:
            latitude: Property latitude
            longitude: Property longitude
            radius: Search radius in meters

        Returns:
            TransportAccessibility analysis
        """
        transport_types = ["metro", "bus_stop", "train_station", "tram_stop"]
        elements = await self._query_overpass(latitude, longitude, radius, transport_types)

        # Categorize POIs
        pois_by_type = {t: [] for t in transport_types}

        for element in elements:
            tags = element.get("tags", {})

            if tags.get("railway") == "subway_entrance":
                poi_type = "metro"
                category = "transport"
            elif tags.get("highway") == "bus_stop":
                poi_type = "bus_stop"
                category = "transport"
            elif tags.get("railway") == "station":
                poi_type = "train_station"
                category = "transport"
            elif tags.get("railway") == "tram_stop":
                poi_type = "tram_stop"
                category = "transport"
            else:
                continue

            poi = self._element_to_poi(element, latitude, longitude, poi_type, category)
            pois_by_type[poi_type].append(poi)

        # Sort by distance
        for pois in pois_by_type.values():
            pois.sort(key=lambda x: x.distance)

        # Find nearest transport
        all_transport = []
        for pois in pois_by_type.values():
            all_transport.extend(pois)
        all_transport.sort(key=lambda x: x.distance)
        nearest = all_transport[0] if all_transport else None

        # Calculate score
        score = self._calculate_transport_score(pois_by_type, nearest)

        return TransportAccessibility(
            metro_stations=pois_by_type["metro"][:5],
            bus_stops=pois_by_type["bus_stop"][:5],
            train_stations=pois_by_type["train_station"][:3],
            tram_stops=pois_by_type["tram_stop"][:5],
            nearest_transport=nearest,
            transport_score=score,
        )

    def _calculate_transport_score(
        self,
        pois_by_type: Dict[str, List[POI]],
        nearest: Optional[POI],
    ) -> float:
        """Calculate transport accessibility score."""
        score = 0.0

        # Metro proximity is very valuable
        if pois_by_type["metro"]:
            nearest_metro = pois_by_type["metro"][0].distance
            if nearest_metro < 300:
                score += 40
            elif nearest_metro < 500:
                score += 30
            elif nearest_metro < 800:
                score += 20
            else:
                score += 10

        # Bus stops
        if pois_by_type["bus_stop"]:
            nearest_bus = pois_by_type["bus_stop"][0].distance
            if nearest_bus < 200:
                score += 25
            elif nearest_bus < 400:
                score += 15
            elif nearest_bus < 600:
                score += 10

        # Train stations
        if pois_by_type["train_station"]:
            nearest_train = pois_by_type["train_station"][0].distance
            if nearest_train < 500:
                score += 20
            elif nearest_train < 1000:
                score += 10

        # Tram
        if pois_by_type["tram_stop"]:
            nearest_tram = pois_by_type["tram_stop"][0].distance
            if nearest_tram < 300:
                score += 15
            elif nearest_tram < 500:
                score += 10

        return min(100, score)

    async def get_amenities(
        self,
        latitude: float,
        longitude: float,
        radius: int = 1000,
    ) -> AmenitiesAnalysis:
        """
        Get nearby amenities analysis.

        Args:
            latitude: Property latitude
            longitude: Property longitude
            radius: Search radius in meters

        Returns:
            AmenitiesAnalysis
        """
        amenity_types = [
            "school", "university", "kindergarten",
            "hospital", "pharmacy", "doctors",
            "supermarket", "bakery",
            "restaurant", "cafe", "park",
            "bank", "post_office",
        ]

        elements = await self._query_overpass(latitude, longitude, radius, amenity_types)

        # Categorize
        schools = []
        healthcare = []
        shopping = []
        leisure = []
        services = []

        for element in elements:
            tags = element.get("tags", {})
            amenity = tags.get("amenity", "")
            shop = tags.get("shop", "")
            leisure_tag = tags.get("leisure", "")

            if amenity in ["school", "university", "kindergarten"]:
                poi = self._element_to_poi(element, latitude, longitude, amenity, "education")
                schools.append(poi)
            elif amenity in ["hospital", "pharmacy", "doctors"]:
                poi = self._element_to_poi(element, latitude, longitude, amenity, "health")
                healthcare.append(poi)
            elif shop in ["supermarket", "bakery"]:
                poi = self._element_to_poi(element, latitude, longitude, shop, "shopping")
                shopping.append(poi)
            elif amenity in ["restaurant", "cafe"] or leisure_tag == "park":
                poi_type = amenity or leisure_tag
                poi = self._element_to_poi(element, latitude, longitude, poi_type, "leisure")
                leisure.append(poi)
            elif amenity in ["bank", "post_office"]:
                poi = self._element_to_poi(element, latitude, longitude, amenity, "services")
                services.append(poi)

        # Sort by distance
        for lst in [schools, healthcare, shopping, leisure, services]:
            lst.sort(key=lambda x: x.distance)

        return AmenitiesAnalysis(
            schools=schools[:5],
            healthcare=healthcare[:5],
            shopping=shopping[:5],
            leisure=leisure[:10],
            services=services[:3],
        )

    def _calculate_scores(
        self,
        transport: TransportAccessibility,
        amenities: AmenitiesAnalysis,
    ) -> AccessibilityScore:
        """Calculate all accessibility scores."""
        transport_score = transport.transport_score

        # Education score
        education_score = 0.0
        if amenities.schools:
            nearest = amenities.schools[0].distance
            if nearest < 500:
                education_score = 100
            elif nearest < 1000:
                education_score = 70
            elif nearest < 1500:
                education_score = 40
            else:
                education_score = 20

        # Health score
        health_score = 0.0
        if amenities.healthcare:
            nearest = amenities.healthcare[0].distance
            if nearest < 300:
                health_score = 100
            elif nearest < 500:
                health_score = 80
            elif nearest < 800:
                health_score = 60
            else:
                health_score = 30

        # Shopping score
        shopping_score = 0.0
        if amenities.shopping:
            nearest = amenities.shopping[0].distance
            if nearest < 300:
                shopping_score = 100
            elif nearest < 500:
                shopping_score = 80
            elif nearest < 800:
                shopping_score = 50
            else:
                shopping_score = 20

        # Leisure score
        leisure_score = min(100, len(amenities.leisure) * 10)

        # Overall weighted average
        overall = (
            transport_score * 0.35
            + education_score * 0.15
            + health_score * 0.15
            + shopping_score * 0.20
            + leisure_score * 0.15
        )

        # Walkability level
        if overall >= 80:
            walkability = "very_high"
        elif overall >= 60:
            walkability = "high"
        elif overall >= 40:
            walkability = "medium"
        else:
            walkability = "low"

        return AccessibilityScore(
            transport_score=round(transport_score, 1),
            education_score=round(education_score, 1),
            health_score=round(health_score, 1),
            shopping_score=round(shopping_score, 1),
            leisure_score=round(leisure_score, 1),
            overall_score=round(overall, 1),
            walkability=walkability,
        )

    async def get_poi_analysis(
        self,
        latitude: float,
        longitude: float,
    ) -> Optional[POIAnalysis]:
        """
        Get complete POI analysis for a property.

        Args:
            latitude: Property latitude
            longitude: Property longitude

        Returns:
            POIAnalysis or None
        """
        cache_key = f"{latitude:.5f},{longitude:.5f}"

        if cache_key in self._cache:
            return self._cache[cache_key]

        # Fetch transport and amenities in parallel
        transport, amenities = await asyncio.gather(
            self.get_transport_accessibility(latitude, longitude, radius=1000),
            self.get_amenities(latitude, longitude, radius=1000),
        )

        # Calculate scores
        scores = self._calculate_scores(transport, amenities)

        # Count POIs
        total_500m = 0
        total_1km = 0

        all_pois = (
            transport.metro_stations
            + transport.bus_stops
            + transport.train_stations
            + transport.tram_stops
            + amenities.schools
            + amenities.healthcare
            + amenities.shopping
            + amenities.leisure
            + amenities.services
        )

        for poi in all_pois:
            if poi.distance <= 500:
                total_500m += 1
            if poi.distance <= 1000:
                total_1km += 1

        analysis = POIAnalysis(
            transport=transport,
            amenities=amenities,
            scores=scores,
            total_pois_500m=total_500m,
            total_pois_1km=total_1km,
            last_updated=datetime.now().isoformat(),
        )

        self._cache[cache_key] = analysis
        return analysis


# Singleton instance
_poi_service: Optional[POIEnrichmentService] = None


def get_poi_service() -> POIEnrichmentService:
    """Get or create the POI service singleton."""
    global _poi_service
    if _poi_service is None:
        _poi_service = POIEnrichmentService()
    return _poi_service


async def enrich_property_with_pois(
    latitude: float,
    longitude: float,
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to enrich a property with POI data.

    Returns:
        Enrichment data dict or None
    """
    if not latitude or not longitude:
        return None

    service = get_poi_service()

    analysis = await service.get_poi_analysis(latitude, longitude)

    if not analysis:
        return None

    result = {
        "scores": {
            "transport": analysis.scores.transport_score,
            "education": analysis.scores.education_score,
            "health": analysis.scores.health_score,
            "shopping": analysis.scores.shopping_score,
            "leisure": analysis.scores.leisure_score,
            "overall": analysis.scores.overall_score,
            "walkability": analysis.scores.walkability,
        },
        "total_pois_500m": analysis.total_pois_500m,
        "total_pois_1km": analysis.total_pois_1km,
    }

    if analysis.transport.nearest_transport:
        result["nearest_transport"] = {
            "name": analysis.transport.nearest_transport.name,
            "type": analysis.transport.nearest_transport.type,
            "distance": round(analysis.transport.nearest_transport.distance),
        }

    # Include counts by category
    result["poi_counts"] = {
        "metro_stations": len(analysis.transport.metro_stations),
        "bus_stops": len(analysis.transport.bus_stops),
        "train_stations": len(analysis.transport.train_stations),
        "schools": len(analysis.amenities.schools),
        "healthcare": len(analysis.amenities.healthcare),
        "shopping": len(analysis.amenities.shopping),
        "leisure": len(analysis.amenities.leisure),
    }

    return result
