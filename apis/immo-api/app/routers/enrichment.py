"""
Enrichment API Router

Provides endpoints for property data enrichment using various external data sources:
- DVF: Market prices from real estate transactions
- Cadastre: Parcel and building information
- INSEE: Socio-economic indicators
- POI: Points of Interest and accessibility analysis
- OCR: Document analysis
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
import asyncio

from ..services.dvf_enrichment import enrich_property_with_dvf, get_dvf_service
from ..services.cadastre_enrichment import enrich_property_with_cadastre, get_cadastre_service
from ..services.insee_enrichment import enrich_property_with_insee, get_insee_service
from ..services.poi_enrichment import enrich_property_with_pois, get_poi_service
from ..services.document_ocr import analyze_auction_document, get_ocr_service

router = APIRouter()


# Response Models
class DVFEnrichmentResponse(BaseModel):
    """DVF enrichment response."""
    market_analysis: Optional[Dict[str, Any]] = None
    discount_analysis: Optional[Dict[str, Any]] = None


class CadastreEnrichmentResponse(BaseModel):
    """Cadastre enrichment response."""
    parcel: Optional[Dict[str, Any]] = None
    buildings_count: int = 0
    total_parcel_surface: float = 0
    total_built_surface: float = 0
    built_ratio: Optional[float] = None
    zone_type: Optional[str] = None


class INSEEEnrichmentResponse(BaseModel):
    """INSEE enrichment response."""
    commune: Optional[Dict[str, Any]] = None
    population: Optional[Dict[str, Any]] = None
    income: Optional[Dict[str, Any]] = None
    housing: Optional[Dict[str, Any]] = None
    quality_score: Optional[float] = None
    investment_attractiveness: Optional[str] = None


class POIEnrichmentResponse(BaseModel):
    """POI enrichment response."""
    scores: Optional[Dict[str, Any]] = None
    nearest_transport: Optional[Dict[str, Any]] = None
    poi_counts: Optional[Dict[str, int]] = None
    total_pois_500m: int = 0
    total_pois_1km: int = 0


class DocumentAnalysisResponse(BaseModel):
    """Document analysis response."""
    document_type: str
    extraction_confidence: float
    property: Dict[str, Any] = {}
    legal: Dict[str, Any] = {}
    financial: Dict[str, Any] = {}
    visits: List[str] = []


class FullEnrichmentResponse(BaseModel):
    """Complete enrichment response with all data sources."""
    dvf: Optional[DVFEnrichmentResponse] = None
    cadastre: Optional[CadastreEnrichmentResponse] = None
    insee: Optional[INSEEEnrichmentResponse] = None
    poi: Optional[POIEnrichmentResponse] = None


# DVF Endpoints
@router.get("/dvf/market-price", response_model=DVFEnrichmentResponse)
async def get_dvf_market_price(
    postal_code: str = Query(..., description="French postal code (5 digits)"),
    property_type: Optional[str] = Query(None, description="Property type: apartment, house, land, commercial"),
    surface: Optional[float] = Query(None, ge=1, description="Property surface in m²"),
    starting_price: Optional[float] = Query(None, ge=0, description="Auction starting price in €"),
):
    """
    Get market price data from DVF (Demandes de Valeurs Foncières).

    Returns median and average prices per m² for the given postal code,
    based on actual real estate transactions from the last 24 months.
    """
    result = await enrich_property_with_dvf(
        postal_code=postal_code,
        starting_price=starting_price or 0,
        surface=surface,
        property_type=property_type,
    )

    if not result:
        return DVFEnrichmentResponse()

    return DVFEnrichmentResponse(
        market_analysis=result.get("market_analysis"),
        discount_analysis=result.get("discount_analysis"),
    )


@router.get("/dvf/transactions")
async def get_dvf_transactions(
    postal_code: str = Query(..., description="French postal code"),
    property_type: Optional[str] = Query(None, description="Property type filter"),
    months_back: int = Query(24, ge=1, le=60, description="Months of history"),
    limit: int = Query(50, ge=1, le=200, description="Maximum transactions"),
):
    """
    Get recent real estate transactions for a postal code.

    Returns a list of actual sales with prices, surfaces, and dates.
    """
    service = get_dvf_service()
    transactions = await service.get_transactions(
        postal_code=postal_code,
        property_type=property_type,
        months_back=months_back,
        limit=limit,
    )

    return {
        "postal_code": postal_code,
        "transaction_count": len(transactions),
        "transactions": [
            {
                "date": t.date,
                "price": t.price,
                "surface": t.surface,
                "price_per_sqm": t.price_per_sqm,
                "property_type": t.property_type,
                "rooms": t.rooms,
                "commune": t.commune,
                "address": t.address,
            }
            for t in transactions
        ],
    }


# Cadastre Endpoints
@router.get("/cadastre/parcel", response_model=CadastreEnrichmentResponse)
async def get_cadastre_parcel(
    latitude: Optional[float] = Query(None, description="GPS latitude"),
    longitude: Optional[float] = Query(None, description="GPS longitude"),
    address: Optional[str] = Query(None, description="Street address"),
    postal_code: Optional[str] = Query(None, description="Postal code"),
    city: Optional[str] = Query(None, description="City name"),
):
    """
    Get cadastral parcel information.

    Returns parcel details including surface, section, and building information.
    Either provide coordinates (latitude, longitude) or address details.
    """
    if not (latitude and longitude) and not (address and postal_code and city):
        raise HTTPException(
            status_code=400,
            detail="Provide either coordinates (latitude, longitude) or address (address, postal_code, city)",
        )

    result = await enrich_property_with_cadastre(
        latitude=latitude,
        longitude=longitude,
        address=address,
        postal_code=postal_code,
        city=city,
    )

    if not result:
        return CadastreEnrichmentResponse()

    return CadastreEnrichmentResponse(**result)


# INSEE Endpoints
@router.get("/insee/socioeconomic", response_model=INSEEEnrichmentResponse)
async def get_insee_indicators(
    postal_code: Optional[str] = Query(None, description="Postal code"),
    city: Optional[str] = Query(None, description="City name"),
    insee_code: Optional[str] = Query(None, description="INSEE commune code"),
):
    """
    Get socio-economic indicators for a commune.

    Returns population, income, unemployment, and housing statistics.
    """
    if not postal_code and not city and not insee_code:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of: postal_code, city, or insee_code",
        )

    result = await enrich_property_with_insee(
        postal_code=postal_code,
        city=city,
    )

    if not result:
        return INSEEEnrichmentResponse()

    return INSEEEnrichmentResponse(**result)


# POI Endpoints
@router.get("/poi/accessibility", response_model=POIEnrichmentResponse)
async def get_poi_accessibility(
    latitude: float = Query(..., description="GPS latitude"),
    longitude: float = Query(..., description="GPS longitude"),
):
    """
    Get Points of Interest and accessibility analysis.

    Returns transport accessibility, nearby amenities, and walkability scores.
    """
    result = await enrich_property_with_pois(latitude, longitude)

    if not result:
        return POIEnrichmentResponse()

    return POIEnrichmentResponse(**result)


# Document OCR Endpoints
@router.get("/document/analyze", response_model=DocumentAnalysisResponse)
async def analyze_document(
    url: str = Query(..., description="URL of the PDF document to analyze"),
):
    """
    Analyze an auction document (PV, cahier des charges).

    Extracts property details, legal information, financial data, and visit dates.
    """
    result = await analyze_auction_document(url=url)

    if not result:
        raise HTTPException(
            status_code=422,
            detail="Could not extract information from document",
        )

    return DocumentAnalysisResponse(**result)


# Full Enrichment Endpoint
@router.get("/full", response_model=FullEnrichmentResponse)
async def get_full_enrichment(
    postal_code: str = Query(..., description="Postal code"),
    latitude: Optional[float] = Query(None, description="GPS latitude"),
    longitude: Optional[float] = Query(None, description="GPS longitude"),
    address: Optional[str] = Query(None, description="Street address"),
    city: Optional[str] = Query(None, description="City name"),
    surface: Optional[float] = Query(None, description="Property surface in m²"),
    starting_price: Optional[float] = Query(None, description="Starting price in €"),
    property_type: Optional[str] = Query(None, description="Property type"),
):
    """
    Get complete enrichment data from all sources.

    Combines DVF, Cadastre, INSEE, and POI data in a single response.
    """
    # Run all enrichments in parallel
    tasks = [
        enrich_property_with_dvf(
            postal_code=postal_code,
            starting_price=starting_price or 0,
            surface=surface,
            property_type=property_type,
        ),
        enrich_property_with_insee(
            postal_code=postal_code,
            city=city,
        ),
    ]

    # Add cadastre and POI if coordinates available
    if latitude and longitude:
        tasks.append(enrich_property_with_cadastre(
            latitude=latitude,
            longitude=longitude,
            address=address,
            postal_code=postal_code,
            city=city,
        ))
        tasks.append(enrich_property_with_pois(latitude, longitude))
    elif address and city:
        tasks.append(enrich_property_with_cadastre(
            address=address,
            postal_code=postal_code,
            city=city,
        ))
        tasks.append(None)  # No POI without coordinates
    else:
        tasks.append(None)
        tasks.append(None)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results
    dvf_data = results[0] if not isinstance(results[0], Exception) else None
    insee_data = results[1] if not isinstance(results[1], Exception) else None
    cadastre_data = results[2] if len(results) > 2 and not isinstance(results[2], Exception) else None
    poi_data = results[3] if len(results) > 3 and results[3] and not isinstance(results[3], Exception) else None

    response = FullEnrichmentResponse()

    if dvf_data:
        response.dvf = DVFEnrichmentResponse(
            market_analysis=dvf_data.get("market_analysis"),
            discount_analysis=dvf_data.get("discount_analysis"),
        )

    if insee_data:
        response.insee = INSEEEnrichmentResponse(**insee_data)

    if cadastre_data:
        response.cadastre = CadastreEnrichmentResponse(**cadastre_data)

    if poi_data:
        response.poi = POIEnrichmentResponse(**poi_data)

    return response


# Health check for enrichment services
@router.get("/health")
async def enrichment_health():
    """Check health of enrichment services."""
    return {
        "status": "ok",
        "services": {
            "dvf": "available",
            "cadastre": "available",
            "insee": "available",
            "poi": "available",
            "ocr": "available",
        },
    }
